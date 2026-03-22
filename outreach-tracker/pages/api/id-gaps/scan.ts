import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/auth';
import { getCommitteeMembers } from '../../../lib/committee-members';
import { getGoogleSheetsClient } from '../../../lib/google-sheets';
import { getCompanyDatabaseSheet } from '../../../lib/spreadsheet-utils';

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

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
        const databaseSpreadsheetId = process.env.SPREADSHEET_ID_1; // Company Database

        // Fetch Company Database
        const dbMetadata = await sheets.spreadsheets.get({ spreadsheetId: databaseSpreadsheetId });
        const { title: dbSheetName } = getCompanyDatabaseSheet(dbMetadata.data.sheets);

        const dbResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: databaseSpreadsheetId,
            range: `${dbSheetName}!A2:B`, // IDs and company names
        });

        const dbRows = dbResponse.data.values || [];

        // Extract unique IDs and first-seen company name per ID
        const ids = new Set<string>();
        const idToName = new Map<string, string>();
        dbRows.forEach(row => {
            const id = row[0];
            if (!id) return;
            ids.add(id);
            if (!idToName.has(id) && row[1]) {
                idToName.set(id, String(row[1]).trim());
            }
        });

        const numericIds = Array.from(ids)
            .map(id => {
                const match = id.match(/ME-(\d+)/);
                return match ? parseInt(match[1], 10) : 0;
            })
            .filter(id => id > 0)
            .sort((a, b) => a - b);

        if (numericIds.length === 0) {
            return res.status(200).json({
                success: true,
                gaps: {
                    missingIds: [],
                    count: 0,
                    minId: 0,
                    maxId: 0,
                    totalCompanies: 0,
                    proposedChanges: []
                }
            });
        }

        const minId = numericIds[0];
        const maxId = numericIds[numericIds.length - 1];
        const missingIds: string[] = [];

        // Find gaps
        for (let i = minId; i <= maxId; i++) {
            if (!numericIds.includes(i)) {
                missingIds.push(`ME-${String(i).padStart(4, '0')}`);
            }
        }

        // Build proposed renumber map (same logic as id-gaps/fix)
        const sortedIds = Array.from(ids).sort((a, b) => {
            const numA = parseInt(a.match(/ME-(\d+)/)?.[1] || '0', 10);
            const numB = parseInt(b.match(/ME-(\d+)/)?.[1] || '0', 10);
            return numA - numB;
        });

        const proposedChanges: Array<{ oldId: string; newId: string; name: string }> = [];
        const idMap = new Map<string, string>();
        sortedIds.forEach((oldId, index) => {
            const newNum = index + 1;
            const newId = `ME-${String(newNum).padStart(4, '0')}`;
            if (oldId !== newId) {
                proposedChanges.push({
                    oldId,
                    newId,
                    name: idToName.get(oldId) || oldId,
                });
                idMap.set(oldId, newId);
            }
        });

        // When there are changes, compute impact summary and generate operationId for mandatory preview
        let operationId: string | undefined;
        let impactSummary: { dbRowsAffected: number; trackerRowsAffected: number; scheduleRowsAffected: number; threadHistoryRowsAffected: number } | undefined;

        if (proposedChanges.length > 0) {
            operationId = `renumber-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

            const trackerSpreadsheetId = process.env.SPREADSHEET_ID_2;
            const trackerMetadata = await sheets.spreadsheets.get({ spreadsheetId: trackerSpreadsheetId! });
            const trackerSheetName = trackerMetadata.data.sheets?.[0].properties?.title;

            const dbAffected = dbRows.filter((row: any) => row[0] && idMap.has(row[0])).length;

            let trackerAffected = 0;
            let scheduleAffected = 0;
            let threadHistoryAffected = 0;

            try {
                if (trackerSheetName) {
                    const trackerResponse = await sheets.spreadsheets.values.get({
                        spreadsheetId: trackerSpreadsheetId!,
                        range: `${trackerSheetName}!A2:A`,
                    });
                    const trackerRows = (trackerResponse.data.values || []) as string[][];
                    trackerAffected = trackerRows.filter(row => row[0] && idMap.has(row[0])).length;
                }
            } catch { /* ignore */ }

            try {
                const scheduleResponse = await sheets.spreadsheets.values.get({
                    spreadsheetId: trackerSpreadsheetId!,
                    range: 'Email_Schedule!A2:A',
                });
                const scheduleRows = (scheduleResponse.data.values || []) as string[][];
                scheduleAffected = scheduleRows.filter(row => row[0] && idMap.has(row[0].trim())).length;
            } catch { /* ignore */ }

            try {
                const historyResponse = await sheets.spreadsheets.values.get({
                    spreadsheetId: trackerSpreadsheetId!,
                    range: 'Thread_History!B2:B',
                });
                const historyRows = (historyResponse.data.values || []) as string[][];
                threadHistoryAffected = historyRows.filter(row => row[0] && idMap.has((row[0] || '').trim())).length;
            } catch { /* ignore */ }

            impactSummary = {
                dbRowsAffected: dbAffected,
                trackerRowsAffected: trackerAffected,
                scheduleRowsAffected: scheduleAffected,
                threadHistoryRowsAffected: threadHistoryAffected,
            };
        }

        return res.status(200).json({
            success: true,
            gaps: {
                missingIds,
                count: missingIds.length,
                minId,
                maxId,
                totalCompanies: ids.size,
                proposedChanges,
                operationId,
                impactSummary,
            }
        });

    } catch (error) {
        console.error('Scan failed:', error);
        return res.status(500).json({ message: 'Failed to scan for ID gaps' });
    }
}
