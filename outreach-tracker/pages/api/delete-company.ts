import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../lib/auth';
import { getCommitteeMembers } from '../../lib/committee-members';
import { getGoogleSheetsClient } from '../../lib/google-sheets';
import { cache } from '../../lib/cache';
import { deleteEmailScheduleEntriesForCompanies } from '../../lib/email-schedule';
import { syncDailyStats } from '../../lib/daily-stats';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.email) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    const members = await getCommitteeMembers();
    const email = session.user.email.toLowerCase().trim();
    const committeeUser = members.find(m => m.email.toLowerCase().trim() === email);
    const roleLower = committeeUser?.role?.toLowerCase() || '';
    const canEdit = committeeUser && (roleLower === 'admin' || roleLower === 'member' || roleLower === 'committee member');
    if (!canEdit) {
        return res.status(403).json({ message: 'Not authorized to delete companies' });
    }

    const { companyId, user } = req.body as { companyId: string; user: string };
    if (!companyId || !user) {
        return res.status(400).json({ message: 'Missing companyId or user' });
    }

    const databaseSpreadsheetId = process.env.SPREADSHEET_ID_1;
    const trackerSpreadsheetId = process.env.SPREADSHEET_ID_2;
    if (!databaseSpreadsheetId || !trackerSpreadsheetId) {
        return res.status(500).json({ message: 'Spreadsheet IDs not configured' });
    }

    try {
        const sheets = await getGoogleSheetsClient();

        // 1. Company database (SPREADSHEET_ID_1): delete all rows where column A = companyId
        const dbMeta = await sheets.spreadsheets.get({ spreadsheetId: databaseSpreadsheetId });
        const dbSheet = dbMeta.data.sheets?.find(s => s.properties?.title?.includes('[AUTOMATION ONLY]'));
        const dbSheetId = dbSheet?.properties?.sheetId;
        const dbSheetName = dbSheet?.properties?.title;
        if (!dbSheetName || dbSheetId === undefined) {
            return res.status(500).json({ message: 'Database sheet not found' });
        }

        const dbColA = await sheets.spreadsheets.values.get({
            spreadsheetId: databaseSpreadsheetId,
            range: `${dbSheetName}!A:A`,
        });
        const dbRows = (dbColA.data.values || []) as string[][];
        const dbRowNumbersToDelete: number[] = [];
        dbRows.forEach((row, i) => {
            if (row[0] && String(row[0]).trim() === String(companyId).trim()) {
                dbRowNumbersToDelete.push(i + 2); // 1-based row number, row 1 = header
            }
        });
        dbRowNumbersToDelete.sort((a, b) => b - a); // delete from bottom to top
        const dbRequests = dbRowNumbersToDelete.map(rowNum => ({
            deleteDimension: {
                range: {
                    sheetId: dbSheetId,
                    dimension: 'ROWS' as const,
                    startIndex: rowNum - 1,
                    endIndex: rowNum,
                },
            },
        }));
        if (dbRequests.length > 0) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId: databaseSpreadsheetId,
                requestBody: { requests: dbRequests },
            });
        }

        // 2. Tracker (SPREADSHEET_ID_2): delete the single row for this company
        const trackerMeta = await sheets.spreadsheets.get({ spreadsheetId: trackerSpreadsheetId });
        const trackerSheet = trackerMeta.data.sheets?.[0];
        const trackerSheetId = trackerSheet?.properties?.sheetId;
        const trackerSheetName = trackerSheet?.properties?.title;
        if (!trackerSheetName || trackerSheetId === undefined) {
            return res.status(500).json({ message: 'Tracker sheet not found' });
        }

        const trackerColA = await sheets.spreadsheets.values.get({
            spreadsheetId: trackerSpreadsheetId,
            range: `${trackerSheetName}!A:A`,
        });
        const trackerRows = (trackerColA.data.values || []) as string[][];
        const trackerRowIndex = trackerRows.findIndex(row => row[0] && String(row[0]).trim() === String(companyId).trim());
        if (trackerRowIndex === -1) {
            return res.status(404).json({ message: 'Company not found in tracker' });
        }
        const trackerRowNum = trackerRowIndex + 2;
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: trackerSpreadsheetId,
            requestBody: {
                requests: [
                    {
                        deleteDimension: {
                            range: {
                                sheetId: trackerSheetId,
                                dimension: 'ROWS' as const,
                                startIndex: trackerRowNum - 1,
                                endIndex: trackerRowNum,
                            },
                        },
                    },
                ],
            },
        });

        // 3. Remove from email schedule
        try {
            await deleteEmailScheduleEntriesForCompanies([companyId]);
        } catch (scheduleErr) {
            console.warn('Could not clear email schedule for deleted company:', scheduleErr);
        }

        // 4. Log and cache
        const timestamp = new Date().toISOString();
        await sheets.spreadsheets.values.append({
            spreadsheetId: trackerSpreadsheetId,
            range: 'Thread_History!A:D',
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[timestamp, companyId, user, `Company ${companyId} deleted from tracker and database`]],
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
