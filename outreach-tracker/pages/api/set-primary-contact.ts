import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleSheetsClient } from '../../lib/google-sheets';
import { cache } from '../../lib/cache';
import { requireEffectiveCanEditCompanies } from '../../lib/authz';
import { formatActorLabel } from '../../lib/authz';

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const ctx = await requireEffectiveCanEditCompanies(req, res);
    if (!ctx) return;

    const { companyId, rowNumber, method, isMethodActive, user } = req.body;

    if (!companyId || !rowNumber || !method || isMethodActive === undefined || !user) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    try {
        const sheets = await getGoogleSheetsClient();
        const spreadsheetId = process.env.SPREADSHEET_ID_1;

        if (!spreadsheetId) {
            throw new Error('SPREADSHEET_ID_1 is not configured');
        }

        const metadata = await sheets.spreadsheets.get({ spreadsheetId });
        const dbSheet = metadata.data.sheets?.find(s => s.properties?.title?.includes('[AUTOMATION ONLY]'));
        const sheetName = dbSheet?.properties?.title || metadata.data.sheets?.[0].properties?.title;

        // Get current activeMethods to append/remove correctly
        const dbResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!O${rowNumber}`
        });
        const currentMethodsStr = dbResponse.data.values?.[0]?.[0] || '';
        let currentMethods = currentMethodsStr ? currentMethodsStr.split(',') : [];

        if (isMethodActive) {
            if (!currentMethods.includes(method)) currentMethods.push(method);
        } else {
            if (method === 'all') {
                currentMethods = [];
            } else {
                currentMethods = currentMethods.filter((m: string) => m !== method);
            }
        }

        const newMethodsStr = currentMethods.join(',');
        const newIsActive = currentMethods.length > 0;

        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: {
                valueInputOption: 'USER_ENTERED',
                data: [
                    { range: `${sheetName}!N${rowNumber}`, values: [[newIsActive ? 'TRUE' : 'FALSE']] },
                    { range: `${sheetName}!O${rowNumber}`, values: [[newMethodsStr]] }
                ]
            }
        });

        const spreadsheetId2 = process.env.SPREADSHEET_ID_2;
        if (spreadsheetId2) {
            const timestamp = new Date().toISOString();
            const action = isMethodActive
                ? `Marked ${method} as currently contacting (row ${rowNumber})`
                : `Unmarked ${method} as currently contacting (row ${rowNumber})`;
            await sheets.spreadsheets.values.append({
                spreadsheetId: spreadsheetId2,
                range: `Thread_History!A:D`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[timestamp, companyId, formatActorLabel(ctx), action]] }
            });
        }

        cache.delete('sheet_data');

        res.status(200).json({ success: true });

    } catch (error) {
        console.error('Set Primary Contact Error:', error);
        res.status(500).json({ message: 'Failed to update contact' });
    }
}
