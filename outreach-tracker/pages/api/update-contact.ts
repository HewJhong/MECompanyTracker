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

    const { rowNumber, updates, user, companyName } = req.body;

    if (!rowNumber || !user) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    try {
        const sheets = await getGoogleSheetsClient();
        const spreadsheetId = process.env.SPREADSHEET_ID;

        const metadata = await sheets.spreadsheets.get({ spreadsheetId });
        const sheetName = metadata.data.sheets?.[0].properties?.title;

        // Map contact fields to columns
        // G=6 (PIC Name), H=7 (Email), I=8 (Phone), K=10 (LinkedIn), M=12 (Remark)
        const CONTACT_COL_MAP: Record<string, string> = {
            'picName': 'G',
            'email': 'H',
            'phone': 'I',
            'linkedin': 'K',
            'remark': 'M'
        };

        const valueUpdates = [];
        const timestamp = new Date().toISOString();

        // Also update the "Last Updated" column (O=14) for this row
        valueUpdates.push({
            range: `${sheetName}!O${rowNumber}`,
            values: [[timestamp]]
        });

        // Apply contact updates
        Object.entries(updates).forEach(([key, value]) => {
            if (CONTACT_COL_MAP[key]) {
                valueUpdates.push({
                    range: `${sheetName}!${CONTACT_COL_MAP[key]}${rowNumber}`,
                    values: [[value]]
                });
            }
        });

        if (valueUpdates.length > 0) {
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId,
                requestBody: {
                    valueInputOption: 'USER_ENTERED',
                    data: valueUpdates
                }
            });
        }

        // Log the change
        const logSheetName = 'Logs_DoNotEdit';
        const logValues = [
            [timestamp, user, companyName || 'Unknown', JSON.stringify({ contactUpdate: updates, rowNumber }), '', '', 'Contact updated']
        ];

        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: `${logSheetName}!A:G`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: logValues }
        });

        // Invalidate Cache
        cache.delete('sheet_data');

        res.status(200).json({ success: true });

    } catch (error) {
        console.error('Contact Update Error:', error);
        res.status(500).json({ message: 'Update Failed' });
    }
}
