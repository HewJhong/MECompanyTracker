import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleSheetsClient } from '../../lib/google-sheets';
import { getCompanyDatabaseSheet } from '../../lib/spreadsheet-utils';
import { cache } from '../../lib/cache';
import { requireEffectiveCanEditCompanies, formatActorLabel } from '../../lib/authz';

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const ctx = await requireEffectiveCanEditCompanies(req, res);
    if (!ctx) return;

    try {
        const sheets = await getGoogleSheetsClient();
        const databaseSpreadsheetId = process.env.SPREADSHEET_ID_1;

        if (!databaseSpreadsheetId) {
            throw new Error('SPREADSHEET_ID_1 is not configured');
        }

        // 1. Get metadata to find the correct sheet
        const dbMetadata = await sheets.spreadsheets.get({ spreadsheetId: databaseSpreadsheetId });
        const { title: sheetName, sheetId } = getCompanyDatabaseSheet(dbMetadata.data.sheets);

        // 2. Fetch existing rows (excluding header)
        const dbResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: databaseSpreadsheetId,
            range: `${sheetName}!A2:N`,
        });

        const rows = dbResponse.data.values || [];

        if (rows.length === 0) {
            return res.status(200).json({ success: true, message: 'No rows to sort' });
        }

        // 3. Sort the rows by Company ID (Column A, which is rows[i][0])
        const sortedRows = [...rows].sort((a, b) => {
            const idA = a[0] ? String(a[0]).trim() : '';
            const idB = b[0] ? String(b[0]).trim() : '';
            return idA.localeCompare(idB);
        });

        // 4. Update the sheet via batchUpdate (Clear and Append is risky, UpdateCells is safer, but basic Update range is best)
        // We update A2:N to overwrite everything below the header
        await sheets.spreadsheets.values.update({
            spreadsheetId: databaseSpreadsheetId,
            range: `${sheetName}!A2:N`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: sortedRows
            }
        });

        // Optional: clear any trailing rows if the sortedRows length is smaller somehow (unlikely since we just reordered)

        // Log to Thread_History and Logs_DoNotEdit
        const trackerSpreadsheetId = process.env.SPREADSHEET_ID_2;
        if (trackerSpreadsheetId) {
            const now = new Date().toISOString();
            const actorName = formatActorLabel(ctx);
            const firstId = sortedRows[0]?.[0] || 'ME-0001';
            await sheets.spreadsheets.values.append({
                spreadsheetId: trackerSpreadsheetId,
                range: 'Thread_History!A:D',
                valueInputOption: 'RAW',
                requestBody: {
                    values: [[now, firstId, actorName, `Reorder rows: sorted ${sortedRows.length} rows in Database by Company ID`]],
                },
            });
            await sheets.spreadsheets.values.append({
                spreadsheetId: trackerSpreadsheetId,
                range: 'Logs_DoNotEdit!A:E',
                valueInputOption: 'RAW',
                requestBody: {
                    values: [[now, actorName, 'REORDER_ROWS', `Sorted ${sortedRows.length} rows in Database by Company ID`, JSON.stringify({ rowCount: sortedRows.length })]],
                },
            });
        }

        // Clear cache so frontend fetches new order
        cache.delete('sheet_data');
        cache.delete('company_database');

        res.status(200).json({
            success: true,
            message: `Successfully reordered ${sortedRows.length} rows.`
        });

    } catch (error: any) {
        console.error('Reorder Rows API Error:', error);
        res.status(500).json({ message: error.message || 'Internal Server Error' });
    }
}
