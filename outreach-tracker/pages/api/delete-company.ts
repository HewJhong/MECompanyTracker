import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleSheetsClient } from '../../lib/google-sheets';
import { getCompanyDatabaseSheet } from '../../lib/spreadsheet-utils';
import { cache } from '../../lib/cache';
import { deleteEmailScheduleEntriesForCompanies } from '../../lib/email-schedule';
import { syncDailyStats } from '../../lib/daily-stats';
import { requireEffectiveCanEditCompanies } from '../../lib/authz';
import { formatActorLabel } from '../../lib/authz';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const ctx = await requireEffectiveCanEditCompanies(req, res);
    if (!ctx) return;

        const { companyId, user } = req.body as { companyId: string; user: string };
    if (!companyId || !user) {
        return res.status(400).json({ message: 'Missing companyId or user' });
    }
    console.log(`[ARCHIVE] Request to archive companyId: "${companyId}"`);

    const databaseSpreadsheetId = process.env.SPREADSHEET_ID_1;
    const trackerSpreadsheetId = process.env.SPREADSHEET_ID_2;
    if (!trackerSpreadsheetId) {
        return res.status(500).json({ message: 'Tracker spreadsheet not configured' });
    }

    try {
        const sheets = await getGoogleSheetsClient();

        // Soft delete: Set Deleted (column P) = "Y" in Tracker and column P in Database.
        // Database rows are kept for easy restore.
        const trackerMeta = await sheets.spreadsheets.get({ spreadsheetId: trackerSpreadsheetId });
        const trackerSheet = trackerMeta.data.sheets?.[0];
        const trackerSheetName = trackerSheet?.properties?.title;
        if (!trackerSheetName) {
            return res.status(500).json({ message: 'Tracker sheet not found' });
        }

        const trackerColA = await sheets.spreadsheets.values.get({
            spreadsheetId: trackerSpreadsheetId,
            range: `${trackerSheetName}!A:A`,
        });
        const trackerRows = (trackerColA.data.values || []) as string[][];
        const trackerRowIndex = trackerRows.findIndex(row => row[0] && String(row[0]).trim() === String(companyId).trim());
        if (trackerRowIndex === -1) {
            console.log(`[ARCHIVE] Company not found in tracker: "${companyId}"`);
            return res.status(404).json({ message: 'Company not found in tracker' });
        }
        // A:A includes header; index i = sheet row i+1
        const trackerRowNum = trackerRowIndex + 1;
        const matchedId = trackerRows[trackerRowIndex]?.[0]?.toString().trim();
        console.log(`[ARCHIVE] Tracker match: companyId="${companyId}" found at arrayIndex=${trackerRowIndex}, sheetRow=${trackerRowNum}, rowIdInSheet="${matchedId}"`);

        // Set column P (Deleted) to "Y" in Tracker
        await sheets.spreadsheets.values.update({
            spreadsheetId: trackerSpreadsheetId,
            range: `${trackerSheetName}!P${trackerRowNum}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [['Y']] },
        });
        console.log(`[ARCHIVE] Set Tracker P${trackerRowNum}=Y for companyId="${companyId}"`);

        // 2. Set column P (Deleted) to "Y" in Database for all rows with this companyId
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
                        dbRowNumbers.push(i + 1); // A:A includes header; index i = sheet row i+1
                    }
                });
                if (dbRowNumbers.length > 0) {
                    console.log(`[ARCHIVE] Updating Database: companyId="${companyId}", rows=${dbRowNumbers.join(', ')}`);
                    const data = dbRowNumbers.map(rowNum => ({
                        range: `${dbSheetName}!P${rowNum}`,
                        values: [['Y']],
                    }));
                    await sheets.spreadsheets.values.batchUpdate({
                        spreadsheetId: databaseSpreadsheetId,
                        valueInputOption: 'USER_ENTERED',
                        requestBody: { data },
                    });
                }
            } catch (dbErr) {
                console.warn('Could not update Database Deleted column:', dbErr);
            }
        }

        // 3. Remove from email schedule
        try {
            await deleteEmailScheduleEntriesForCompanies([companyId]);
        } catch (scheduleErr) {
            console.warn('Could not clear email schedule for deleted company:', scheduleErr);
        }

        // 4. Log to Thread_History and Logs_DoNotEdit
        const timestamp = new Date().toISOString();
        const actorName = formatActorLabel(ctx);
        const deleteRemark = `Company ${companyId} archived (soft deleted)`;
        await sheets.spreadsheets.values.append({
            spreadsheetId: trackerSpreadsheetId,
            range: 'Thread_History!A:D',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[timestamp, companyId, actorName, deleteRemark]] },
        });
        await sheets.spreadsheets.values.append({
            spreadsheetId: trackerSpreadsheetId,
            range: 'Logs_DoNotEdit!A:E',
            valueInputOption: 'RAW',
            requestBody: {
                values: [[timestamp, actorName, 'SOFT_DELETE_COMPANY', `${companyId} – ${deleteRemark}`, JSON.stringify({ companyId })]],
            },
        });
        cache.delete('sheet_data');
        await syncDailyStats(sheets, trackerSpreadsheetId);

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Delete company error:', error);
        return res.status(500).json({
            message: error instanceof Error ? error.message : 'Delete failed',
        });
    }
}
