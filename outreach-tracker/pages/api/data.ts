import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleSheetsClient } from '../../lib/google-sheets';
import { getCompanyDatabaseSheet } from '../../lib/spreadsheet-utils';
import { getCommitteeMembers, CommitteeMember } from '../../lib/committee-members';
import { cache } from '../../lib/cache';

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const startTime = Date.now();
    console.log(">>> [API DATA] Request started");

    try {
        // 1. Check Cache
        const { refresh } = req.query;
        const CACHE_KEY = 'sheet_data';
        const cachedData = cache.get(CACHE_KEY);

        if (cachedData && refresh !== 'true') {
            console.log(">>> [API DATA] Serving from cache");
            res.setHeader('X-Cache', 'HIT');
            return res.status(200).json(cachedData);
        }

        console.log(">>> [API DATA] Fetching from Sheets...");
        const sheets = await getGoogleSheetsClient();
        const databaseSpreadsheetId = process.env.SPREADSHEET_ID_1;
        const trackerSpreadsheetId = process.env.SPREADSHEET_ID_2;

        // DB Fetch
        console.log(">>> [API DATA] DB Metadata...");
        const dbMetadata = await sheets.spreadsheets.get({ spreadsheetId: databaseSpreadsheetId });
        const { title: dbSheetName } = getCompanyDatabaseSheet(dbMetadata.data.sheets);

        console.log(">>> [API DATA] DB Rows...");
        const dbResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: databaseSpreadsheetId,
            range: `${dbSheetName}!A2:O`,
        });
        const dbRows = dbResponse.data.values || [];

        // Tracker Fetch
        console.log(">>> [API DATA] Tracker Metadata...");
        const trackerMetadata = await sheets.spreadsheets.get({ spreadsheetId: trackerSpreadsheetId });
        const trackerSheetName = trackerMetadata.data.sheets?.[0].properties?.title;
        if (!trackerSheetName) throw new Error('Tracker Sheet not found');

        console.log(">>> [API DATA] Tracker Rows...");
        const trackerResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: trackerSpreadsheetId,
            range: `${trackerSheetName}!A2:P`,
        });
        const trackerRows = trackerResponse.data.values || [];

        // History Fetch
        console.log(">>> [API DATA] History...");
        let historyData: any[] = [];
        try {
            const historyResponse = await sheets.spreadsheets.values.get({
                spreadsheetId: trackerSpreadsheetId,
                range: `Thread_History!A2:D`,
            });
            historyData = (historyResponse.data.values || []).map((row, index) => ({
                id: `history-${index}`,
                timestamp: row[0],
                companyId: row[1],
                user: row[2],
                action: row[3] || '',
                remark: row[3] || ''
            }));
        } catch (e) {
            console.warn("History fetch failed");
        }

        // Daily Stats Fetch
        console.log(">>> [API DATA] Daily Stats...");
        let dailyStats: any[] = [];
        try {
            const statsResponse = await sheets.spreadsheets.values.get({
                spreadsheetId: trackerSpreadsheetId,
                // Daily_Stats columns: Date, Total, To Contact, Contacted, To Follow Up, Interested, Registered, No Reply, Rejected
                range: `Daily_Stats!A2:I`,
            });
            dailyStats = (statsResponse.data.values || []).map(row => ({
                date: row[0],
                total: parseInt(row[1], 10) || 0,
                toContact: parseInt(row[2], 10) || 0,
                contacted: parseInt(row[3], 10) || 0,
                toFollowUp: parseInt(row[4], 10) || 0,
                interested: parseInt(row[5], 10) || 0,
                registered: parseInt(row[6], 10) || 0,
                noReply: parseInt(row[7], 10) || 0,
                rejected: parseInt(row[8], 10) || 0,
            }));
        } catch (e) {
            console.warn("Daily Stats fetch failed, sheet might not exist yet");
        }

        // Processing
        console.log(">>> [API DATA] Processing...");
        const trackerMap = new Map();
        trackerRows.forEach((row) => {
            if (!row[0]) return;
            const deleted = (row[15] || '').toString().trim().toUpperCase() === 'Y';
            trackerMap.set(row[0], {
                companyId: row[0],
                companyName: row[1],
                contactStatus: row[2] || 'To Contact',
                relationshipStatus: row[3] || '',
                channel: row[4] || '',
                urgencyScore: parseInt(row[5]) || 0,
                previousResponse: row[6],
                assignedPic: row[7],
                lastCompanyContact: row[8],
                lastContact: row[9],
                followUpsCompleted: parseInt(row[10]) || 0,
                sponsorshipTier: row[11] || '',
                daysAttending: row[12] || '',
                remarks: row[13] || '',
                lastUpdate: row[14],
                deleted
            });
        });

        const companyMap = new Map();
        dbRows.forEach((row, index) => {
            const id = row[0];
            if (!id) return;
            if (!companyMap.has(id)) {
                const t = trackerMap.get(id);
                const isDeleted = !!t?.deleted;
                companyMap.set(id, {
                    id,
                    companyName: row[1] || t?.companyName || 'Unknown',
                    contactStatus: t?.contactStatus || 'To Contact',
                    relationshipStatus: t?.relationshipStatus || '',
                    channel: t?.channel || '',
                    urgencyScore: t?.urgencyScore || 0,
                    pic: t?.assignedPic || 'Unassigned',
                    followUpsCompleted: t?.followUpsCompleted || 0,
                    sponsorshipTier: t?.sponsorshipTier || '',
                    remark: t?.remarks || '',
                    lastUpdated: t?.lastUpdate || '',
                    lastCompanyActivity: t?.previousResponse || t?.lastUpdate || '',
                    previousResponse: t?.previousResponse || '',
                    lastContact: t?.lastContact || '',
                    daysAttending: t?.daysAttending || '',
                    discipline: row[2],
                    targetSponsorshipTier: row[3],
                    reference: row[10],
                    isFlagged: false,
                    isDeleted,
                    contacts: []
                });
            }
            const c = companyMap.get(id);
            const hasContactInfo = (row[5] && row[5].trim()) || (row[7] && row[7].trim()) || (row[8] && row[8].trim()) || (row[10] && row[10].trim());
            if (hasContactInfo) {
                c.contacts.push({
                    id: `contact-${id}-${index}`,
                    rowNumber: index + 2,
                    name: row[5],
                    role: row[6],
                    email: row[7],
                    phone: row[8],
                    landline: row[9],
                    linkedin: row[10],
                    remark: row[12],
                    isActive: row[13] === 'TRUE',
                    activeMethods: row[14] || ''
                });
            }
        });

        // Detect Tracker-only companies (exist in Tracker but not in Database)
        const dbIds = new Set<string>();
        dbRows.forEach((row: any) => {
            const id = row[0]?.toString().trim();
            if (id) dbIds.add(id);
        });
        const trackerOnlyCompanies: Array<{ id: string; name: string }> = [];
        trackerRows.forEach((row: any) => {
            const id = row[0]?.toString().trim();
            const name = (row[1] || '').toString().trim();
            const deleted = (row[15] || '').toString().trim().toUpperCase() === 'Y';
            if (id && !dbIds.has(id) && !deleted) {
                trackerOnlyCompanies.push({ id, name: name || id });
            }
        });

        const data = Array.from(companyMap.values()).filter(c => !c.isDeleted);
        data.forEach(c => {
            // No filter other than companyId – show all thread history for this company.
            // Sort newest first so the latest updates appear at the top.
            const companyHistory = historyData.filter(h => h.companyId === c.id);
            companyHistory.sort((a, b) => {
                const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
                const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
                return tB - tA;
            });
            c.history = companyHistory;
            const now = Date.now();
            const lu = c.lastUpdated ? new Date(c.lastUpdated).getTime() : 0;
            const la = c.lastCompanyActivity ? new Date(c.lastCompanyActivity).getTime() : 0;
            c.isCommitteeStale = (now - lu) / (1000 * 60 * 60 * 24) > 7;
            c.isCompanyStale = (now - la) / (1000 * 60 * 60 * 24) > 7;
        });

        console.log(">>> [API DATA] Committee Members...");
        let committeeMembers: CommitteeMember[] = [];
        try {
            committeeMembers = await getCommitteeMembers();
        } catch (e) { }

        // When refreshing, check for ID/name mismatches (Tracker vs Database as source of truth)
        let idNameMismatches: Array<{ id: string; trackerName: string; dbName: string }> = [];
        if (refresh === 'true') {
            const normalizeId = (s: string) => s?.toString().trim().toUpperCase() || '';
            const normalizeName = (s: string) => s?.toLowerCase().replace(/\s+/g, ' ').trim() || '';
            const dbIdToName = new Map<string, string>();
            dbRows.forEach((row: any) => {
                const id = row[0]?.toString().trim();
                if (!id) return;
                const key = normalizeId(id);
                if (dbIdToName.has(key)) return;
                dbIdToName.set(key, (row[1] || '').toString().trim());
            });
            trackerRows.forEach((row: any) => {
                const id = row[0]?.toString().trim();
                const trackerName = (row[1] || '').toString().trim();
                if (!id || !trackerName) return;
                const dbName = dbIdToName.get(normalizeId(id));
                if (!dbName || normalizeName(trackerName) === normalizeName(dbName)) return;
                idNameMismatches.push({ id, trackerName, dbName });
            });
        }

        const responseData = {
            companies: data,
            history: historyData,
            dailyStats,
            committeeMembers,
            idNameMismatches: idNameMismatches.length > 0 ? idNameMismatches : undefined,
            trackerOnlyCompanies: trackerOnlyCompanies.length > 0 ? trackerOnlyCompanies : undefined,
        };
        cache.set(CACHE_KEY, responseData);

        console.log(`>>> [API DATA] Done in ${Date.now() - startTime}ms`);
        res.setHeader('X-Cache', 'MISS');
        return res.status(200).json(responseData);

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ message: (error as any).message || 'Internal Server Error' });
    }
}