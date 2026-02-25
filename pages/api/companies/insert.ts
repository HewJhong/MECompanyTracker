import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/auth';
import { getGoogleSheetsClient } from '../../../lib/google-sheets';
import { cache } from '../../../lib/cache';

// Sanitize user input to prevent formula injection and other issues
function sanitizeInput(input: string, maxLength: number = 500): string {
    if (!input) return '';
    // Remove leading characters that could trigger formulas
    let clean = input.trim().replace(/^[=+\-@]/, '');
    // Limit length to prevent overflow
    return clean.substring(0, maxLength);
}

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    try {
        // 1. Authentication check
        const session = await getServerSession(req, res, authOptions);
        if (!session) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        // Parse and validate input
        const { insertAtId, companyData } = req.body;

        if (!insertAtId || !companyData?.name) {
            return res.status(400).json({ message: 'Missing required fields: insertAtId, companyData.name' });
        }

        const idMatch = insertAtId.match(/^ME-(\d{4})$/);
        if (!idMatch) {
            return res.status(400).json({ message: 'Invalid ID format. Expected ME-XXXX' });
        }

        const insertNumeric = parseInt(idMatch[1], 10);

        // Validate ID is within reasonable range
        if (insertNumeric < 1 || insertNumeric > 9999) {
            return res.status(400).json({ message: 'ID must be between ME-0001 and ME-9999' });
        }

        // Sanitize user inputs
        const sanitizedName = sanitizeInput(companyData.name, 200);
        const sanitizedDiscipline = sanitizeInput(companyData.discipline || '', 100);
        const sanitizedPriority = sanitizeInput(companyData.priority || 'Normal', 50);

        if (!sanitizedName) {
            return res.status(400).json({ message: 'Company name cannot be empty after sanitization' });
        }



        // 2. Get Google Sheets clients
        const sheets = await getGoogleSheetsClient();
        const databaseSpreadsheetId = process.env.SPREADSHEET_ID_1;
        const trackerSpreadsheetId = process.env.SPREADSHEET_ID_2;

        if (!databaseSpreadsheetId || !trackerSpreadsheetId) {
            return res.status(500).json({ message: 'Missing spreadsheet configuration' });
        }

        // 3. Fetch Database sheet
        const dbMetadata = await sheets.spreadsheets.get({ spreadsheetId: databaseSpreadsheetId });
        const dbSheet = dbMetadata.data.sheets?.find(sheet =>
            sheet.properties?.title?.includes('[AUTOMATION ONLY]')
        );
        const dbSheetName = dbSheet?.properties?.title;
        if (!dbSheetName) throw new Error('Company Database sheet not found');

        const dbResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: databaseSpreadsheetId,
            range: `${dbSheetName}!A2:N`,
        });
        const dbRows = dbResponse.data.values || [];

        // 4. Fetch Tracker sheet
        const trackerMetadata = await sheets.spreadsheets.get({ spreadsheetId: trackerSpreadsheetId });
        const trackerSheetName = trackerMetadata.data.sheets?.[0].properties?.title;
        if (!trackerSheetName) throw new Error('Outreach Tracker sheet not found');

        const trackerResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: trackerSpreadsheetId,
            range: `${trackerSheetName}!A2:M`,
        });
        const trackerRows = trackerResponse.data.values || [];

        // 5. Build renumbering map
        const existingIds = new Map<number, boolean>();
        dbRows.forEach(row => {
            const id = row[0];
            if (id) {
                const match = id.match(/ME-(\d+)/);
                if (match) {
                    existingIds.set(parseInt(match[1], 10), true);
                }
            }
        });

        // Count how many companies will be shifted
        const shiftCount = Array.from(existingIds.keys()).filter(id => id >= insertNumeric).length;

        // 6. Prepare updates - Process in REVERSE order
        const sortedIds = Array.from(existingIds.keys()).sort((a, b) => b - a);

        // Build batch update for Database
        const dbUpdates: any[] = [];
        for (const oldNumeric of sortedIds) {
            if (oldNumeric >= insertNumeric) {
                const newNumeric = oldNumeric + 1;
                const newId = `ME-${String(newNumeric).padStart(4, '0')}`;

                // Find all rows with this ID (multiple contacts per company)
                dbRows.forEach((row, index) => {
                    if (row[0] === `ME-${String(oldNumeric).padStart(4, '0')}`) {
                        dbUpdates.push({
                            range: `${dbSheetName}!A${index + 2}`,
                            values: [[newId]]
                        });
                    }
                });
            }
        }

        // Build batch update for Tracker
        const trackerUpdates: any[] = [];
        for (const oldNumeric of sortedIds) {
            if (oldNumeric >= insertNumeric) {
                const newNumeric = oldNumeric + 1;
                const newId = `ME-${String(newNumeric).padStart(4, '0')}`;

                trackerRows.forEach((row, index) => {
                    if (row[0] === `ME-${String(oldNumeric).padStart(4, '0')}`) {
                        trackerUpdates.push({
                            range: `${trackerSheetName}!A${index + 2}`,
                            values: [[newId]]
                        });
                    }
                });
            }
        }

        // 7. Execute batch updates
        if (dbUpdates.length > 0) {
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: databaseSpreadsheetId,
                requestBody: {
                    valueInputOption: 'RAW',
                    data: dbUpdates
                }
            });
        }

        if (trackerUpdates.length > 0) {
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: trackerSpreadsheetId,
                requestBody: {
                    valueInputOption: 'RAW',
                    data: trackerUpdates
                }
            });
        }

        // 8. Insert new company row in Database
        const newDbRow = [
            insertAtId,
            sanitizedName,
            sanitizedDiscipline,
            sanitizedPriority,
            '', // Previous Response
            '', // Company PIC
            '', // Role
            '', // Email
            '', // Phone Number
            '', // Landline Number
            '', // Linkedin
            '', // Reference
            '', // Remarks
            'TRUE' // isActive
        ];

        // Find the correct row position to insert
        // NOTE: This calculation uses the ORIGINAL row positions from before the batch ID shifts.
        // The INSERT_ROWS operation should handle this correctly, but verify in testing.
        let insertRowIndex = 2; // Start from row 2 (after header)
        for (let i = 0; i < dbRows.length; i++) {
            const rowId = dbRows[i][0];
            if (rowId) {
                const match = rowId.match(/ME-(\d+)/);
                if (match) {
                    const rowNumeric = parseInt(match[1], 10);
                    if (rowNumeric < insertNumeric) {
                        insertRowIndex = i + 3; // +2 for header, +1 to insert after
                    } else {
                        break;
                    }
                }
            }
        }

        await sheets.spreadsheets.values.append({
            spreadsheetId: databaseSpreadsheetId,
            range: `${dbSheetName}!A${insertRowIndex}`,
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            requestBody: {
                values: [newDbRow]
            }
        });

        // 9. Insert new company in Tracker
        const newTrackerRow = [
            insertAtId,
            sanitizedName,
            'To Contact', // Status
            '', // Urgency Score
            'Unassigned', // Assigned PIC
            '0', // Follow Ups Completed
            '', // Sponsorship Tier
            '', // Remarks
            new Date().toISOString(), // Last Updated
            '', // Last Company Activity
            '' // Last Contact
        ];

        await sheets.spreadsheets.values.append({
            spreadsheetId: trackerSpreadsheetId,
            range: `${trackerSheetName}!A${insertRowIndex}`,
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            requestBody: {
                values: [newTrackerRow]
            }
        });

        // 10. Clear cache
        cache.clear();

        // 11. Return success
        return res.status(200).json({
            success: true,
            insertedId: insertAtId,
            companiesShifted: shiftCount,
            newTotalCount: existingIds.size + 1
        });

    } catch (error) {
        console.error('Insert company failed:', error);
        return res.status(500).json({
            message: 'Failed to insert company',
            // Only expose error details in development
            ...(process.env.NODE_ENV === 'development' && {
                error: error instanceof Error ? error.message : 'Unknown error'
            })
        });
    }
}
