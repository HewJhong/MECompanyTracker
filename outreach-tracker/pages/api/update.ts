import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleSheetsClient } from '../../lib/google-sheets';
import { cache } from '../../lib/cache';

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const { oldCompanyName, updates, user, remark } = req.body;

    if (!oldCompanyName || !user) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    try {
        const sheets = await getGoogleSheetsClient();
        const spreadsheetId = process.env.SPREADSHEET_ID;

        // 1. Find Rows for this Company
        const metadata = await sheets.spreadsheets.get({ spreadsheetId });
        const sheetName = metadata.data.sheets?.[0].properties?.title;

        // Fetch Column B only
        const nameRange = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!B:B`,
        });

        const rows = nameRange.data.values || [];
        const targetRowIndices: number[] = [];

        rows.forEach((row, index) => {
            if (row[0] === oldCompanyName) {
                targetRowIndices.push(index + 1); // 1-based index
            }
        });

        if (targetRowIndices.length === 0) {
            return res.status(404).json({ message: 'Company not found' });
        }

        // 2. Prepare Batch Updates
        // Map field names to Column Indices
        const COL_MAP: Record<string, string> = {
            'companyName': 'B',
            'discipline': 'C',
            'priority': 'D',
            'status': 'E',
            'pic': 'N',
            'isFlagged': 'P',
            'lastUpdated': 'O'
        };

        const valueUpdates = [];
        const timestamp = new Date().toISOString();

        // Loop through each target row
        for (const rowIndex of targetRowIndices) {
            // Update "Last Updated" for all
            valueUpdates.push({
                range: `${sheetName}!${COL_MAP['lastUpdated']}${rowIndex}`,
                values: [[timestamp]]
            });

            // Apply renaming if needed
            if (updates.companyName && updates.companyName !== oldCompanyName) {
                valueUpdates.push({
                    range: `${sheetName}!${COL_MAP['companyName']}${rowIndex}`,
                    values: [[updates.companyName]]
                });
            }

            // Apply other updates
            if (updates.status) {
                valueUpdates.push({
                    range: `${sheetName}!${COL_MAP['status']}${rowIndex}`,
                    values: [[updates.status]]
                });
            }
            if (updates.pic) {
                valueUpdates.push({
                    range: `${sheetName}!${COL_MAP['pic']}${rowIndex}`,
                    values: [[updates.pic]]
                });
            }
            if (updates.discipline) {
                valueUpdates.push({
                    range: `${sheetName}!${COL_MAP['discipline']}${rowIndex}`,
                    values: [[updates.discipline]]
                });
            }
            if (updates.priority) {
                valueUpdates.push({
                    range: `${sheetName}!${COL_MAP['priority']}${rowIndex}`,
                    values: [[updates.priority]]
                });
            }
            if (updates.isFlagged !== undefined) {
                valueUpdates.push({
                    range: `${sheetName}!${COL_MAP['isFlagged']}${rowIndex}`,
                    values: [[updates.isFlagged ? 'TRUE' : 'FALSE']]
                });
            }
        }

        // Execute Batch Update
        if (valueUpdates.length > 0) {
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId,
                requestBody: {
                    valueInputOption: 'USER_ENTERED',
                    data: valueUpdates
                }
            });
        }

        // 3. Append to Logs
        const logSheetName = 'Logs_DoNotEdit';
        const logValues = [
            [timestamp, user, oldCompanyName, JSON.stringify(updates), '', '', remark || '']
        ];

        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: `${logSheetName}!A:G`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: logValues }
        });

        // 4. Append to Thread History if remark exists
        if (remark) {
            await sheets.spreadsheets.values.append({
                spreadsheetId,
                range: `Thread_History!A:D`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[timestamp, updates.companyName || oldCompanyName, user, remark]] }
            });
        }

        // 5. Invalidate Cache
        cache.delete('sheet_data');

        res.status(200).json({ success: true, updatedRows: targetRowIndices.length });

    } catch (error) {
        console.error('Update Error:', error);
        res.status(500).json({ message: 'Update Failed' });
    }
}
