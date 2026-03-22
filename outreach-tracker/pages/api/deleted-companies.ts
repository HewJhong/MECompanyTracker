import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleSheetsClient } from '../../lib/google-sheets';
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

    const trackerSpreadsheetId = process.env.SPREADSHEET_ID_2;
    if (!trackerSpreadsheetId) {
        return res.status(500).json({ message: 'Tracker spreadsheet not configured' });
    }

    try {
        const sheets = await getGoogleSheetsClient();
        const trackerMeta = await sheets.spreadsheets.get({ spreadsheetId: trackerSpreadsheetId });
        const trackerSheetName = trackerMeta.data.sheets?.[0]?.properties?.title;
        if (!trackerSheetName) {
            return res.status(500).json({ message: 'Tracker sheet not found' });
        }

        const trackerResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: trackerSpreadsheetId,
            range: `${trackerSheetName}!A2:P`,
        });
        const trackerRows = (trackerResponse.data.values || []) as string[][];

        const deleted = trackerRows
            .filter((row) => {
                const id = row[0]?.toString().trim();
                const deletedFlag = (row[15] || '').toString().trim().toUpperCase() === 'Y';
                return id && deletedFlag;
            })
            .map((row) => ({
                id: row[0]?.toString().trim() || '',
                name: (row[1] || '').toString().trim() || row[0] || '',
            }));

        return res.status(200).json({ deleted });
    } catch (error) {
        console.error('Deleted companies fetch error:', error);
        return res.status(500).json({
            message: error instanceof Error ? error.message : 'Fetch failed',
        });
    }
}
