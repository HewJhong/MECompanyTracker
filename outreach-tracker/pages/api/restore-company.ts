import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleSheetsClient } from '../../lib/google-sheets';
import { getCompanyDatabaseSheet } from '../../lib/spreadsheet-utils';
import { cache } from '../../lib/cache';
import { syncDailyStats } from '../../lib/daily-stats';
import { requireSuperAdmin, formatActorLabel } from '../../lib/authz';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const ctx = await requireSuperAdmin(req, res);
    if (!ctx) return;

    const { companyId, user } = req.body as { companyId: string; user: string };
    if (!companyId || !user) {
        return res.status(400).json({ message: 'Missing companyId or user' });
    }

    const databaseSpreadsheetId = process.env.SPREADSHEET_ID_1;
    const trackerSpreadsheetId = process.env.SPREADSHEET_ID_2;
    if (!trackerSpreadsheetId) {
        return res.status(500).json({ message: 'Tracker spreadsheet not configured' });
    }

    try {
        const sheets = await getGoogleSheetsClient();

        const trackerMeta = await sheets.spreadsheets.get({ spreadsheetId: trackerSpreadsheetId });
        const trackerSheet = trackerMeta.data.sheets?.[0];
        const trackerSheetName = trackerSheet?.properties?.title;
        if (!trackerSheetName) {
            return res.status(500).json({ message: 'Tracker sheet not found' });
        }

        // Fetch full rows to find company and verify it is soft-deleted
        const trackerResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: trackerSpreadsheetId,
            range: `${trackerSheetName}!A2:P`,
        });
        const trackerRows = (trackerResponse.data.values || []) as string[][];
        const rowIndex = trackerRows.findIndex(
            row => row[0] && String(row[0]).trim() === String(companyId).trim()
        );
        if (rowIndex === -1) {
            return res.status(404).json({ message: 'Company not found in tracker' });
        }
        const deleted = (trackerRows[rowIndex][15] || '').toString().trim().toUpperCase() === 'Y';
        if (!deleted) {
            return res.status(400).json({ message: 'Company is not deleted' });
        }

        const trackerRowNum = rowIndex + 2;

        // Clear column P (Deleted) in Tracker
        await sheets.spreadsheets.values.update({
            spreadsheetId: trackerSpreadsheetId,
            range: `${trackerSheetName}!P${trackerRowNum}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [['']] },
        });

        // Clear column P (Deleted) in Database for all rows with this companyId
        if (databaseSpreadsheetId) {
            try {
                const dbMeta = await sheets.spreadsheets.get({ spreadsheetId: databaseSpreadsheetId });
                const { title: dbSheetName } = getCompanyDatabaseSheet(dbMeta.data.sheets);
                const dbColA = await sheets.spreadsheets.values.get({
                    spreadsheetId: databaseSpreadsheetId,
                    range: `${dbSheetName}!A:A`,
                });
                const dbRows = (dbColA.data.values || []) as string[][];
                const dbRowNumbers: number[] = [];
                dbRows.forEach((row, i) => {
                    if (row[0] && String(row[0]).trim() === String(companyId).trim()) {
                        dbRowNumbers.push(i + 2); // 1-based row number
                    }
                });
                if (dbRowNumbers.length > 0) {
                    const data = dbRowNumbers.map(rowNum => ({
                        range: `${dbSheetName}!P${rowNum}`,
                        values: [['']],
                    }));
                    await sheets.spreadsheets.values.batchUpdate({
                        spreadsheetId: databaseSpreadsheetId,
                        valueInputOption: 'USER_ENTERED',
                        requestBody: { data },
                    });
                }
            } catch (dbErr) {
                console.warn('Could not clear Database Deleted column:', dbErr);
            }
        }

        const timestamp = new Date().toISOString();
        const actorName = formatActorLabel(ctx);
        const restoreRemark = `Company ${companyId} restored from archive`;
        await sheets.spreadsheets.values.append({
            spreadsheetId: trackerSpreadsheetId,
            range: 'Thread_History!A:D',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[timestamp, companyId, actorName, restoreRemark]] },
        });
        await sheets.spreadsheets.values.append({
            spreadsheetId: trackerSpreadsheetId,
            range: 'Logs_DoNotEdit!A:E',
            valueInputOption: 'RAW',
            requestBody: {
                values: [[timestamp, actorName, 'RESTORE_COMPANY', `${companyId} – ${restoreRemark}`, JSON.stringify({ companyId })]],
            },
        });

        cache.delete('sheet_data');
        await syncDailyStats(sheets, trackerSpreadsheetId);

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Restore company error:', error);
        return res.status(500).json({
            message: error instanceof Error ? error.message : 'Restore failed',
        });
    }
}
