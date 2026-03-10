import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleSheetsClient } from '../../lib/google-sheets';
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
        const dbSheet = dbMetadata.data.sheets?.find(s => s.properties?.title?.includes('[AUTOMATION ONLY]'));
        const dbSheetName = dbSheet?.properties?.title;
        if (!dbSheetName) throw new Error('DB Sheet not found');

        console.log(">>> [API DATA] DB Rows...");
        const dbResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: databaseSpreadsheetId,
            range: `${dbSheetName}!A2:N`,
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
            range: `${trackerSheetName}!A2:N`,
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

        // Processing
        console.log(">>> [API DATA] Processing...");
        const trackerMap = new Map();
        trackerRows.forEach((row) => {
            if (!row[0]) return;
            trackerMap.set(row[0], {
                companyId: row[0],
                companyName: row[1],
                status: row[2] || 'To Contact',
                channel: row[3] || '',
                urgencyScore: parseInt(row[4]) || 0,
                previousResponse: row[5],
                assignedPic: row[6],
                lastCompanyContact: row[7],
                lastContact: row[8],
                followUpsCompleted: parseInt(row[9]) || 0,
                sponsorshipTier: row[10] || '',
                daysAttending: row[11] || '',
                remarks: row[12] || '',
                lastUpdate: row[13]
            });
        });

        const companyMap = new Map();
        dbRows.forEach((row, index) => {
            const id = row[0];
            if (!id) return;
            if (!companyMap.has(id)) {
                const t = trackerMap.get(id);
                companyMap.set(id, {
                    id,
                    companyName: t?.companyName || row[1] || 'Unknown',
                    status: t?.status || 'To Contact',
                    urgencyScore: t?.urgencyScore || 0,
                    pic: t?.assignedPic || 'Unassigned',
                    followUpsCompleted: t?.followUpsCompleted || 0,
                    sponsorshipTier: t?.sponsorshipTier || '',
                    remark: t?.remarks || '',
                    lastUpdated: t?.lastUpdate || '',
                    lastCompanyActivity: t?.previousResponse || t?.lastUpdate || '',
                    lastContact: t?.lastContact || '',
                    daysAttending: t?.daysAttending || '',
                    discipline: row[2],
                    targetSponsorshipTier: row[3],
                    reference: row[10],
                    isFlagged: false,
                    contacts: []
                });
            }
            const c = companyMap.get(id);
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
                isActive: row[13] === 'TRUE'
            });
        });

        const data = Array.from(companyMap.values());
        data.forEach(c => {
            c.history = historyData.filter(h => h.companyId === c.id);
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

        const responseData = { companies: data, history: historyData, committeeMembers };
        cache.set(CACHE_KEY, responseData);

        console.log(`>>> [API DATA] Done in ${Date.now() - startTime}ms`);
        res.setHeader('X-Cache', 'MISS');
        return res.status(200).json(responseData);

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ message: (error as any).message || 'Internal Server Error' });
    }
}