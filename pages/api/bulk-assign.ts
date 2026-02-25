import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../lib/auth';
import { getCommitteeMembers } from '../../lib/committee-members';
import { getGoogleSheetsClient } from '../../lib/google-sheets';
import { cache } from '../../lib/cache';

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Check admin permission
        const session = await getServerSession(req, res, authOptions);

        if (!session || !session.user || !session.user.email) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Fetch user from Committee_Members sheet
        const members = await getCommitteeMembers();
        const userEmail = session.user.email.toLowerCase().trim();
        const user = members.find(m => m.email.toLowerCase().trim() === userEmail);

        if (!user || user.role?.toLowerCase() !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { companyIds, assignee } = req.body;

        // Validate inputs
        if (!Array.isArray(companyIds) || companyIds.length === 0) {
            return res.status(400).json({ error: 'Invalid or empty company IDs array' });
        }

        if (!assignee || typeof assignee !== 'string') {
            return res.status(400).json({ error: 'Invalid assignee' });
        }

        // Get Google Sheets client
        const sheets = await getGoogleSheetsClient();
        const spreadsheetId = process.env.SPREADSHEET_ID_2;

        if (!spreadsheetId) {
            return res.status(500).json({ error: 'Spreadsheet ID not configured' });
        }

        // Fetch metadata to get the correct sheet name
        const metadata = await sheets.spreadsheets.get({ spreadsheetId });
        const sheetName = metadata.data.sheets?.[0].properties?.title;

        if (!sheetName) {
            return res.status(500).json({ error: 'Could not determine sheet name' });
        }

        // Quote sheet name if it contains spaces or special characters
        const safeSheetName = `'${sheetName.replace(/'/g, "''")}'`;

        // Read current data to find row numbers
        const dataResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${safeSheetName}!A:Z`,
        });

        const rows = dataResponse.data.values || [];
        if (rows.length === 0) {
            return res.status(404).json({ error: 'No data found in sheet' });
        }

        const headers = rows[0].map((h: string) => h.toLowerCase().trim());
        const picColumnIndex = headers.findIndex((h: string) =>
            h === 'assigned pic' || h === 'pic' || h === 'assigned to'
        );
        const lastUpdatedColumnIndex = headers.findIndex((h: string) =>
            h === 'last updated' || h === 'last update' || h === 'updated'
        );

        if (picColumnIndex === -1) {
            console.error('Available headers:', rows[0]);
            return res.status(500).json({
                error: 'Assigned PIC column not found in sheet',
                details: `Available columns: ${rows[0].join(', ')}`
            });
        }

        // Build batch update requests for each company
        const updates = [];
        const successfulIds: string[] = [];
        const timestamp = new Date().toISOString();

        for (const companyId of companyIds) {
            const valueToSave = assignee === '__UNASSIGN__' ? '' : assignee;
            const rowIndex = rows.findIndex(row => row[0] === companyId);
            if (rowIndex > 0) {
                // Update PIC column
                updates.push({
                    range: `${safeSheetName}!${String.fromCharCode(65 + picColumnIndex)}${rowIndex + 1}`,
                    values: [[valueToSave]],
                });

                // Update Last Updated column if it exists
                if (lastUpdatedColumnIndex !== -1) {
                    updates.push({
                        range: `${safeSheetName}!${String.fromCharCode(65 + lastUpdatedColumnIndex)}${rowIndex + 1}`,
                        values: [[timestamp]],
                    });
                }
                successfulIds.push(companyId);
            }
        }

        if (updates.length === 0) {
            return res.status(404).json({ error: 'No matching companies found' });
        }

        // Execute batch update
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: {
                valueInputOption: 'USER_ENTERED', // Use USER_ENTERED to allow Sheets to parse the date if needed
                data: updates,
            },
        });

        // Log the assignment action to Logs sheet
        const logEntry = {
            timestamp: new Date().toISOString(),
            user: session.user.name || session.user.email,
            action: 'BULK_ASSIGN',
            details: `Assigned ${successfulIds.length} companies to ${assignee}`,
            companyIds: successfulIds.join(', '),
        };

        try {
            await sheets.spreadsheets.values.append({
                spreadsheetId,
                range: 'Logs_DoNotEdit!A:E',
                valueInputOption: 'RAW',
                requestBody: {
                    values: [[
                        logEntry.timestamp,
                        logEntry.user,
                        logEntry.action,
                        logEntry.details,
                        logEntry.companyIds,
                    ]],
                },
            });
        } catch (logError) {
            console.error('Failed to log assignment:', logError);
            // Don't fail the request if logging fails
        }

        // Invalidate cache to ensure fresh data is fetched
        cache.delete('sheet_data');

        return res.status(200).json({
            success: true,
            updated: successfulIds.length,
            companyIds: successfulIds,
        });
    } catch (error) {
        console.error('Bulk assign error:', error);
        return res.status(500).json({
            error: 'Failed to assign companies',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
