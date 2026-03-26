import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleSheetsClient } from '../../lib/google-sheets';
import { getCompanyDatabaseSheet } from '../../lib/spreadsheet-utils';
import { requireSuperAdmin } from '../../lib/authz';

/**
 * GET /api/deleted-companies
 * Returns the list of soft-deleted companies (superadmin only).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const ctx = await requireSuperAdmin(req, res);
    if (!ctx) return;

    const databaseSpreadsheetId = process.env.SPREADSHEET_ID_1;
    if (!databaseSpreadsheetId) {
        return res.status(500).json({ message: 'Database spreadsheet not configured' });
    }

    try {
        const sheets = await getGoogleSheetsClient();
        const dbMeta = await sheets.spreadsheets.get({ spreadsheetId: databaseSpreadsheetId });
        const { title: dbSheetName } = getCompanyDatabaseSheet(dbMeta.data.sheets);

        const dbResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: databaseSpreadsheetId,
            range: `${dbSheetName}!A2:P`,
        });
        const dbRows = (dbResponse.data.values || []) as string[][];

        const deleted = dbRows
            .filter((row) => {
                const id = row[0]?.toString().trim();
                const deletedFlag = (row[15] || '').toString().trim().toUpperCase() === 'Y';
                return id && deletedFlag;
            })
            .map((row) => ({
                id: row[0]?.toString().trim() || '',
                name: (row[1] || '').toString().trim() || row[0] || '',
            }))
            // DB can contain multiple rows per company (contacts), so dedupe by ID.
            .filter((row, idx, arr) => arr.findIndex(r => r.id === row.id) === idx);

        return res.status(200).json({ deleted });
    } catch (error) {
        console.error('Deleted companies fetch error:', error);
        return res.status(500).json({
            message: error instanceof Error ? error.message : 'Fetch failed',
        });
    }
}
