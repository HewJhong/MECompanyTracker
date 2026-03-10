import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/auth';
import { getGoogleSheetsClient } from '../../../lib/google-sheets';
import { cache } from '../../../lib/cache';

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

        // 2. Get Google Sheets client
        const sheets = await getGoogleSheetsClient();
        const databaseSpreadsheetId = process.env.SPREADSHEET_ID_1;
        const trackerSpreadsheetId = process.env.SPREADSHEET_ID_2;

        if (!databaseSpreadsheetId || !trackerSpreadsheetId) {
            return res.status(500).json({ message: 'Missing spreadsheet configuration' });
        }

        // 3. Find SOURCE sheet: Compile Company List (user fixed the headers)
        const dbMetadata = await sheets.spreadsheets.get({ spreadsheetId: databaseSpreadsheetId });

        console.log('[Import] Available sheets in database:', dbMetadata.data.sheets?.map(s => s.properties?.title));

        // User fixed "Compile Company List" headers - use it as source
        let originalSheet = dbMetadata.data.sheets?.find(s => s.properties?.title === 'Compiled Company List');
        if (originalSheet) {
            console.log('[Import] Found "Compiled Company List" sheet');
        }

        if (!originalSheet) {
            return res.status(404).json({ message: 'Source sheet "Compiled Company List" not found' });
        }

        const originalSheetName = originalSheet.properties?.title || '';
        console.log('[Import] Using source sheet:', originalSheetName);

        // Read source sheet - get Company Name and Previous Response (entire sheet)
        const originalResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: databaseSpreadsheetId,
            range: `${originalSheetName}!A:Z`, // Read all rows
        });
        const originalRows = originalResponse.data.values || [];

        console.log('[Import] Read', originalRows.length, 'rows from', originalSheetName);
        console.log('[Import] Header row:', originalRows[0]);

        if (originalRows.length === 0) {
            return res.status(400).json({ message: 'Source sheet is empty' });
        }

        // 4. Find column indices in SOURCE sheet
        const headerRow = originalRows[0];
        const companyNameColIndex = headerRow.findIndex((h: string) =>
            h?.toLowerCase().trim() === 'company name'
        );
        const prevResponseColIndex = headerRow.findIndex((h: string) =>
            h?.toLowerCase().trim() === 'previous response'
        );

        if (companyNameColIndex === -1) {
            return res.status(400).json({
                message: `"Company Name" column not found in source sheet. Available columns: ${headerRow.join(', ')}`
            });
        }

        if (prevResponseColIndex === -1) {
            return res.status(400).json({
                message: `"Previous Response" column not found in source sheet. Available columns: ${headerRow.join(', ')}`
            });
        }

        console.log('[Import] Company Name at index:', companyNameColIndex);
        console.log('[Import] Previous Response at index:', prevResponseColIndex);

        // 5. Build map: Company Name -> Previous Response
        const responsesMap = new Map<string, string>();
        for (let i = 1; i < originalRows.length; i++) {
            const row = originalRows[i];
            const companyName = row[companyNameColIndex]?.trim();
            const previousResponse = row[prevResponseColIndex]?.trim() || '';

            if (companyName) {
                responsesMap.set(companyName, previousResponse);
            }
        }

        console.log('[Import] Built map with', responsesMap.size, 'companies');

        // 6. Read TARGET sheet: [AUTOMATION ONLY] Compiled Company List (SAME spreadsheet as source)
        // Both sheets are in the Master Database (SPREADSHEET_ID_1), not the Tracker!
        const targetMetadata = await sheets.spreadsheets.get({ spreadsheetId: databaseSpreadsheetId });

        // Target is strictly "[AUTOMATION ONLY] Compiled Company List" in the same spreadsheet
        const targetSheetName = targetMetadata.data.sheets?.find(s => s.properties?.title === '[AUTOMATION ONLY] Compiled Company List')?.properties?.title;

        if (!targetSheetName) {
            return res.status(404).json({ message: 'Target sheet "[AUTOMATION ONLY] Compiled Company List" not found in Master Database' });
        }

        console.log('[Import] Using target sheet:', targetSheetName);

        const targetResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: databaseSpreadsheetId,
            range: `${targetSheetName}!A2:E`, // Company ID, Name, Status, Channel, Previous Response (Index 4 = Column E)
        });
        const targetRows = targetResponse.data.values || [];

        console.log('[Import] Read', targetRows.length, 'rows from target');

        // 7. Build batch updates for matched companies
        const batchUpdates: any[] = [];
        const matched: string[] = [];
        const unmatched: string[] = [];

        targetRows.forEach((row, index) => {
            const companyId = row[0];
            const companyName = row[1]?.trim();

            if (!companyName) return;

            if (responsesMap.has(companyName)) {
                const previousResponse = responsesMap.get(companyName) || '';

                // Log for debugging empty responses
                if (previousResponse === '') {
                    console.log(`[Import] Empty response for: ${companyName} (will clear/sync)`);
                }

                // Update column E (Previous Response) in target sheet (Index 4)
                batchUpdates.push({
                    range: `${targetSheetName}!E${index + 2}`, // +2 for header row and 0-index
                    values: [[previousResponse]]
                });

                matched.push(companyName);
            }
        });

        // Identify unmatched companies from source sheet
        Array.from(responsesMap.keys()).forEach(companyName => {
            const found = targetRows.some(row => row[1]?.trim() === companyName);
            if (!found) {
                unmatched.push(companyName);
            }
        });

        console.log('[Import] Matched:', matched.length, 'Unmatched:', unmatched.length);

        // 8. STEP 1: Clear the entire Previous Response column (E) first
        const lastRow = targetRows.length + 1; // +1 for header row
        console.log(`[Import] Clearing column E (rows 2 to ${lastRow}) in ${targetSheetName}...`);

        await sheets.spreadsheets.values.clear({
            spreadsheetId: databaseSpreadsheetId,
            range: `${targetSheetName}!E2:E${lastRow}`
        });
        console.log('[Import] Column E cleared successfully');

        // 9. STEP 2: Write new values from source
        if (batchUpdates.length > 0) {
            console.log(`[Import] Writing ${batchUpdates.length} values to column E...`);
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: databaseSpreadsheetId,
                requestBody: {
                    valueInputOption: 'RAW',
                    data: batchUpdates
                }
            });
            console.log('[Import] Applied', batchUpdates.length, 'updates');
        }

        // 10. Clear cache
        cache.clear();

        // 11. Return statistics
        return res.status(200).json({
            success: true,
            stats: {
                totalInOriginal: responsesMap.size,
                matched: matched.length,
                unmatchedCompanies: unmatched.slice(0, 10), // Return first 10 unmatched
                totalUnmatched: unmatched.length
            }
        });

    } catch (error) {
        console.error('Import previous responses failed:', error);
        return res.status(500).json({
            message: 'Failed to import previous responses',
            // Only expose error details in development
            ...(process.env.NODE_ENV === 'development' && {
                error: error instanceof Error ? error.message : 'Unknown error'
            })
        });
    }
}
