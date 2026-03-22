import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/auth';
import { getCommitteeMembers } from '../../../lib/committee-members';
import { getGoogleSheetsClient } from '../../../lib/google-sheets';
import { getCompanyDatabaseSheet } from '../../../lib/spreadsheet-utils';
import { cache } from '../../../lib/cache';
import { invalidateScheduleCache } from '../../../lib/email-schedule';

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const operationId = body.operationId;

    try {
        const session = await getServerSession(req, res, authOptions);
        if (!session?.user?.email) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const members = await getCommitteeMembers();
        const userEmail = session.user.email.toLowerCase().trim();
        const user = members.find(m => m.email?.toLowerCase().trim() === userEmail);
        const roleLower = user?.role?.toLowerCase() || '';
        if (!user || roleLower !== 'superadmin') {
            return res.status(403).json({ message: 'Superadmin access required' });
        }

        const sheets = await getGoogleSheetsClient();
        const databaseSpreadsheetId = process.env.SPREADSHEET_ID_1;
        const trackerSpreadsheetId = process.env.SPREADSHEET_ID_2;

        // 1. Fetch Data
        // Database
        const dbMetadata = await sheets.spreadsheets.get({ spreadsheetId: databaseSpreadsheetId });
        const { title: dbSheetName } = getCompanyDatabaseSheet(dbMetadata.data.sheets);

        const dbResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: databaseSpreadsheetId,
            range: `${dbSheetName}!A2:A`,
        });
        const dbRows = dbResponse.data.values || []; // Array of [ID]

        // Tracker
        const trackerMetadata = await sheets.spreadsheets.get({ spreadsheetId: trackerSpreadsheetId });
        const trackerSheetName = trackerMetadata.data.sheets?.[0].properties?.title;
        if (!trackerSheetName) throw new Error('Outreach Tracker sheet not found');

        const trackerResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: trackerSpreadsheetId,
            range: `${trackerSheetName}!A2:A`,
        });
        const trackerRows = trackerResponse.data.values || []; // Array of [ID]

        // 2. Calculate Renumbering Map
        const uniqueIds = new Set<string>();
        dbRows.forEach(row => {
            if (row[0]) uniqueIds.add(row[0]);
        });

        // Sort IDs numerically
        const sortedIds = Array.from(uniqueIds).sort((a, b) => {
            const numA = parseInt(a.match(/ME-(\d+)/)?.[1] || '0', 10);
            const numB = parseInt(b.match(/ME-(\d+)/)?.[1] || '0', 10);
            return numA - numB;
        });

        const idMap = new Map<string, string>(); // Old -> New
        const changes: { oldId: string; newId: string }[] = [];

        sortedIds.forEach((oldId, index) => {
            const newNum = index + 1;
            const newId = `ME-${String(newNum).padStart(4, '0')}`;

            if (oldId !== newId) {
                idMap.set(oldId, newId);
                changes.push({ oldId, newId });
            }
        });

        if (changes.length === 0) {
            return res.status(200).json({ success: true, message: 'No gaps to fix', changes: [] });
        }

        // Require operation ID from preview – ensures user reviewed before applying
        if (!operationId || typeof operationId !== 'string' || !operationId.startsWith('renumber-')) {
            return res.status(400).json({
                success: false,
                message: 'operationId required. Run ID gap scan first to get preview and operationId, then confirm apply.',
            });
        }

        // 3. Prepare Updates

        // Update Database Rows
        const newDbRows = dbRows.map(row => {
            const id = row[0];
            if (id && idMap.has(id)) {
                return [idMap.get(id)];
            }
            return row; // Keep original if not remapped (or empty)
        });

        // Update Tracker Rows
        const newTrackerRows = trackerRows.map(row => {
            const id = row[0];
            if (id && idMap.has(id)) {
                return [idMap.get(id)];
            }
            return row;
        });

        // 4. Perform Updates
        await Promise.all([
            sheets.spreadsheets.values.update({
                spreadsheetId: databaseSpreadsheetId,
                range: `${dbSheetName}!A2:A${newDbRows.length + 1}`,
                valueInputOption: 'RAW',
                requestBody: { values: newDbRows },
            }),
            sheets.spreadsheets.values.update({
                spreadsheetId: trackerSpreadsheetId,
                range: `${trackerSheetName}!A2:A${newTrackerRows.length + 1}`,
                valueInputOption: 'RAW',
                requestBody: { values: newTrackerRows },
            })
        ]);

        // 5. Update Email_Schedule column A (companyId) so schedule entries stay linked after renumber
        try {
            const scheduleResponse = await sheets.spreadsheets.values.get({
                spreadsheetId: trackerSpreadsheetId,
                range: 'Email_Schedule!A2:A',
            });
            const scheduleRows = (scheduleResponse.data.values || []) as string[][];
            if (scheduleRows.length > 0) {
                const newScheduleIds = scheduleRows.map(row => {
                    const oldId = row[0] ? String(row[0]).trim() : '';
                    const newId = oldId && idMap.has(oldId) ? idMap.get(oldId)! : oldId;
                    return [newId];
                });
                const changedCount = newScheduleIds.filter((row, i) => {
                    const old = scheduleRows[i]?.[0]?.trim() || '';
                    return old && idMap.has(old);
                }).length;
                if (changedCount > 0) {
                    await sheets.spreadsheets.values.update({
                        spreadsheetId: trackerSpreadsheetId,
                        range: `Email_Schedule!A2:A${1 + newScheduleIds.length}`,
                        valueInputOption: 'RAW',
                        requestBody: { values: newScheduleIds },
                    });
                    invalidateScheduleCache();
                }
            }
        } catch (scheduleErr) {
            console.warn('Email_Schedule update during fix ID gaps failed (sheet may not exist):', scheduleErr);
        }

        // 6. Update Thread_History so activity logs still match companies (column B = companyId)
        try {
            const historyResponse = await sheets.spreadsheets.values.get({
                spreadsheetId: trackerSpreadsheetId,
                range: 'Thread_History!B2:B',
            });
            const historyCompanyIds = (historyResponse.data.values || []) as string[][];
            if (historyCompanyIds.length > 0) {
                const newHistoryIds = historyCompanyIds.map(row => {
                    const oldId = row[0] ? String(row[0]).trim() : '';
                    const newId = oldId && idMap.has(oldId) ? idMap.get(oldId)! : oldId;
                    return [newId];
                });
                await sheets.spreadsheets.values.update({
                    spreadsheetId: trackerSpreadsheetId,
                    range: `Thread_History!B2:B${1 + newHistoryIds.length}`,
                    valueInputOption: 'RAW',
                    requestBody: { values: newHistoryIds },
                });
            }
        } catch (historyErr) {
            console.warn('Thread_History update during fix ID gaps failed (sheet may not exist):', historyErr);
        }

        // 7. Append RENUMBER_APPLY and RENUMBER_REVERT_MAP to Logs with operation ID for audit/revert
        const forwardMap = Object.fromEntries(idMap);
        const reverseMap: Record<string, string> = {};
        idMap.forEach((newId, oldId) => { reverseMap[newId] = oldId; });

        const dbAffected = (dbRows as string[][]).filter(row => row[0] && idMap.has(row[0])).length;
        const trackerAffected = (trackerRows as string[][]).filter(row => row[0] && idMap.has(row[0])).length;

        try {
            const actorName = user?.name || user?.email || session?.user?.email || 'FixIdGaps';
            const now = new Date().toISOString();
            await sheets.spreadsheets.values.append({
                spreadsheetId: trackerSpreadsheetId,
                range: 'Logs_DoNotEdit!A:E',
                valueInputOption: 'RAW',
                requestBody: {
                    values: [
                        [now, actorName, 'RENUMBER_APPLY', JSON.stringify({
                            operationId,
                            changesCount: changes.length,
                            forwardMap,
                            dbRowsAffected: dbAffected,
                            trackerRowsAffected: trackerAffected,
                            scheduleRowsAffected: 'see Email_Schedule',
                            threadHistoryRowsAffected: 'see Thread_History',
                        })],
                        [now, actorName, 'RENUMBER_REVERT_MAP', JSON.stringify({ operationId, reverseMap })],
                    ],
                },
            });
            const firstId = changes[0]?.newId || 'ME-0001';
            await sheets.spreadsheets.values.append({
                spreadsheetId: trackerSpreadsheetId,
                range: 'Thread_History!A:D',
                valueInputOption: 'RAW',
                requestBody: {
                    values: [[now, firstId, actorName, `Fix ID Gaps: renumbered ${changes.length} companies (opId=${operationId}, see Logs for revert map)`]],
                },
            });
        } catch (logErr) {
            console.warn('Failed to append RENUMBER logs to Logs_DoNotEdit:', logErr);
        }

        // 6. Clear Cache
        cache.clear();

        return res.status(200).json({
            success: true,
            changesCount: changes.length,
            changes: changes.slice(0, 50), // Return partial list
            totalRenumbered: changes.length
        });

    } catch (error) {
        console.error('Fix gaps failed:', error);
        return res.status(500).json({ message: 'Failed to fix ID gaps' });
    }
}
