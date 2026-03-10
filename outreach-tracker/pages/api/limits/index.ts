import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleSheetsClient } from '../../../lib/google-sheets';
import { priorityOptions } from '../../../lib/priority-mapping';

const SPREADSHEET_ID = process.env.SPREADSHEET_ID_2;
const SHEET_NAME = 'Limits';

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    try {
        const sheets = await getGoogleSheetsClient();

        // Ensure the Limits sheet exists, if not create it
        let sheetExists = false;
        try {
            const metadata = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
            sheetExists = metadata.data.sheets?.some(s => s.properties?.title === SHEET_NAME) || false;

            if (!sheetExists) {
                // Determine sheetId to use for create
                const nextSheetId = metadata.data.sheets ? Math.max(...metadata.data.sheets.map(s => s.properties?.sheetId || 0)) + 1 : 123456;
                console.log(`[Limits API] Creating ${SHEET_NAME} sheet with ID: ${nextSheetId}`);

                await sheets.spreadsheets.batchUpdate({
                    spreadsheetId: SPREADSHEET_ID,
                    requestBody: {
                        requests: [
                            {
                                addSheet: {
                                    properties: {
                                        title: SHEET_NAME,
                                        sheetId: nextSheetId
                                    }
                                }
                            }
                        ]
                    }
                });

                // Initialize with headers
                await sheets.spreadsheets.values.update({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `${SHEET_NAME}!A1:C1`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: {
                        values: [['Tier', 'Total Limit', 'Daily Limit']]
                    }
                });
            }
        } catch (error) {
            console.error("Error checking/creating sheet:", error);
            return res.status(500).json({ message: 'Failed to access Google Sheets layout.' });
        }


        if (req.method === 'GET') {
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: `${SHEET_NAME}!A2:C`,
            });

            const rows = response.data.values || [];

            // Map existing limits
            const limitsMap = new Map();
            rows.forEach(row => {
                if (row[0]) {
                    limitsMap.set(row[0], {
                        total: row[1] ? parseInt(row[1], 10) : 0,
                        daily: row[2] ? parseInt(row[2], 10) : 0
                    });
                }
            });

            // Ensure all priority options are covered
            const limits = priorityOptions.map(tier => ({
                tier,
                total: limitsMap.get(tier)?.total || 0,
                daily: limitsMap.get(tier)?.daily || 0
            }));

            return res.status(200).json({ limits });
        }

        if (req.method === 'POST') {
            const { limits } = req.body;

            if (!Array.isArray(limits)) {
                return res.status(400).json({ message: 'Invalid payload: limits must be an array' });
            }

            // Prepare values to write back: Tier, Total, Daily
            const values = limits.map(limit => [
                limit.tier,
                limit.total.toString(),
                limit.daily.toString()
            ]);

            // Clear existing data below header first to handle deletions/reorders safely
            await sheets.spreadsheets.values.clear({
                spreadsheetId: SPREADSHEET_ID,
                range: `${SHEET_NAME}!A2:C`,
            });

            // Write new data
            if (values.length > 0) {
                await sheets.spreadsheets.values.update({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `${SHEET_NAME}!A2:C`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: {
                        values
                    }
                });
            }

            return res.status(200).json({ success: true, message: 'Limits updated successfully' });
        }

    } catch (error) {
        console.error('Limits API Error:', error);
        return res.status(500).json({ message: (error as Error).message || 'Internal Server Error' });
    }
}
