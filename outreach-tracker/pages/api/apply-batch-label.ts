import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleSheetsClient } from '../../lib/google-sheets';
import { getCompanyDatabaseSheet } from '../../lib/spreadsheet-utils';
import { cache } from '../../lib/cache';
import { requireEffectiveCanEditCompanies, formatActorLabel } from '../../lib/authz';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

    const ctx = await requireEffectiveCanEditCompanies(req, res);
    if (!ctx) return;

    const { companyIds, batchLabel } = req.body;

    if (!Array.isArray(companyIds) || companyIds.length === 0) {
        return res.status(400).json({ message: 'companyIds must be a non-empty array' });
    }
    if (typeof batchLabel !== 'string') {
        return res.status(400).json({ message: 'batchLabel must be a string' });
    }

    try {
        const sheets = await getGoogleSheetsClient();
        const spreadsheetId = process.env.SPREADSHEET_ID_1;
        if (!spreadsheetId) throw new Error('SPREADSHEET_ID_1 not configured');

        const metadata = await sheets.spreadsheets.get({ spreadsheetId });
        const { title: sheetName } = getCompanyDatabaseSheet(metadata.data.sheets);

        // Read column A to map company IDs to row numbers
        const colA = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!A:A`,
        });
        const allIds = colA.data.values || [];

        const targetIds = new Set(companyIds.map((id: string) => id.trim()));
        const updates: { range: string; values: string[][] }[] = [];

        allIds.forEach((row, idx) => {
            if (idx === 0) return; // skip header
            const cellId = (row[0] || '').toString().trim();
            if (targetIds.has(cellId)) {
                updates.push({ range: `${sheetName}!S${idx + 1}`, values: [[batchLabel.trim()]] });
            }
        });

        if (updates.length === 0) {
            return res.status(404).json({ message: 'No matching rows found for the given company IDs' });
        }

        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
        });

        const spreadsheetId2 = process.env.SPREADSHEET_ID_2;
        if (spreadsheetId2) {
            const timestamp = new Date().toISOString();
            await sheets.spreadsheets.values.append({
                spreadsheetId: spreadsheetId2,
                range: 'Logs_DoNotEdit!A:E',
                valueInputOption: 'USER_ENTERED',
                requestBody: {
                    values: [[timestamp, formatActorLabel(ctx), 'BATCH_LABEL_APPLIED',
                        `Applied batch label "${batchLabel}" to ${companyIds.length} companies`,
                        JSON.stringify({ companyIds, batchLabel })]],
                },
            });
        }

        cache.delete('sheet_data');
        return res.status(200).json({ success: true, updatedRows: updates.length });

    } catch (error) {
        console.error('Apply batch label error:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
}
