import { getGoogleSheetsClient } from './google-sheets';
import { getCompanyDatabaseSheet } from './spreadsheet-utils';
import { getCommitteeMembers, type CommitteeMember } from './committee-members';
import { cache } from './cache';
import { syncDailyStats } from './daily-stats';
import { withSheetsRetry, isRetryableSheetsError } from './sheets-retry';

export const SHEET_DATA_CACHE_KEY = 'sheet_data';

/** Read-heavy route: more attempts + longer gaps help with per-minute Sheets read quotas (429). */
const DATA_READ_MAX_ATTEMPTS = 7;
const DATA_READ_RETRY_BASE_MS = 2000;
const dataReadRetryOpts = { baseDelayMs: DATA_READ_RETRY_BASE_MS } as const;

export type DailyStatRow = {
    date: string;
    total: number;
    toContact: number;
    contacted: number;
    toFollowUp: number;
    interested: number;
    registered: number;
    noReply: number;
    rejected: number;
};

export type SheetCompany = {
    id: string;
    companyName: string;
    contactStatus: string;
    relationshipStatus: string;
    isDeleted: boolean;
    [key: string]: unknown;
};

export type SheetDataPayload = {
    companies: SheetCompany[];
    history: unknown[];
    dailyStats: DailyStatRow[];
    committeeMembers: CommitteeMember[];
    idNameMismatches?: Array<{ id: string; trackerName: string; dbName: string }>;
    trackerOnlyCompanies?: Array<{ id: string; name: string }>;
};

export type LoadSheetDataSuccess = {
    ok: true;
    payload: SheetDataPayload;
    cacheStatus: 'HIT' | 'MISS' | 'STALE';
};

export type LoadSheetDataFailure = {
    ok: false;
    message: string;
    status: 503 | 500;
    code?: 'SHEETS_QUOTA_OR_UNAVAILABLE';
};

export type LoadSheetDataResult = LoadSheetDataSuccess | LoadSheetDataFailure;

function parseDailyStatsRows(rows: string[][]): DailyStatRow[] {
    return rows.map(row => ({
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
}

async function fetchDailyStats(
    sheets: Awaited<ReturnType<typeof getGoogleSheetsClient>>,
    trackerSpreadsheetId: string,
): Promise<DailyStatRow[]> {
    const statsResponse = await withSheetsRetry(
        () =>
            sheets.spreadsheets.values.get({
                spreadsheetId: trackerSpreadsheetId,
                range: `Daily_Stats!A2:I`,
            }),
        DATA_READ_MAX_ATTEMPTS,
        'sheet-data:dailyStats',
        dataReadRetryOpts,
    );
    return parseDailyStatsRows(statsResponse.data.values || []);
}

export async function loadSheetData(options?: { refresh?: boolean }): Promise<LoadSheetDataResult> {
    const refresh = options?.refresh === true;
    const cachedPayload = cache.get(SHEET_DATA_CACHE_KEY) as SheetDataPayload | undefined;

    const startTime = Date.now();
    console.log('>>> [SHEET DATA] Request started');

    try {
        if (cachedPayload && !refresh) {
            const hasDailyStats = Array.isArray(cachedPayload.dailyStats) && cachedPayload.dailyStats.length > 0;
            if (hasDailyStats) {
                console.log('>>> [SHEET DATA] Serving from cache');
                return { ok: true, payload: cachedPayload, cacheStatus: 'HIT' };
            }
            console.log('>>> [SHEET DATA] Cache miss — daily stats empty, fetching fresh');
        }

        console.log('>>> [SHEET DATA] Fetching from Sheets...');
        const sheets = await getGoogleSheetsClient();
        const databaseSpreadsheetId = process.env.SPREADSHEET_ID_1;
        const trackerSpreadsheetId = process.env.SPREADSHEET_ID_2;
        if (!databaseSpreadsheetId || !trackerSpreadsheetId) {
            throw new Error('SPREADSHEET_ID_1 and SPREADSHEET_ID_2 must be set');
        }

        console.log('>>> [SHEET DATA] DB Metadata...');
        const dbMetadata = await withSheetsRetry(
            () => sheets.spreadsheets.get({ spreadsheetId: databaseSpreadsheetId }),
            DATA_READ_MAX_ATTEMPTS,
            'sheet-data:dbMetadata',
            dataReadRetryOpts,
        );
        const { title: dbSheetName } = getCompanyDatabaseSheet(dbMetadata.data.sheets);

        console.log('>>> [SHEET DATA] DB Rows...');
        const dbResponse = await withSheetsRetry(
            () =>
                sheets.spreadsheets.values.get({
                    spreadsheetId: databaseSpreadsheetId,
                    range: `${dbSheetName}!A2:T`,
                }),
            DATA_READ_MAX_ATTEMPTS,
            'sheet-data:dbRows',
            dataReadRetryOpts,
        );
        const dbRows = dbResponse.data.values || [];

        console.log('>>> [SHEET DATA] Tracker Metadata...');
        const trackerMetadata = await withSheetsRetry(
            () => sheets.spreadsheets.get({ spreadsheetId: trackerSpreadsheetId }),
            DATA_READ_MAX_ATTEMPTS,
            'sheet-data:trackerMetadata',
            dataReadRetryOpts,
        );
        const trackerSheetName = trackerMetadata.data.sheets?.[0].properties?.title;
        if (!trackerSheetName) throw new Error('Tracker Sheet not found');

        console.log('>>> [SHEET DATA] Tracker Rows...');
        const trackerResponse = await withSheetsRetry(
            () =>
                sheets.spreadsheets.values.get({
                    spreadsheetId: trackerSpreadsheetId,
                    range: `${trackerSheetName}!A2:P`,
                }),
            DATA_READ_MAX_ATTEMPTS,
            'sheet-data:trackerRows',
            dataReadRetryOpts,
        );
        const trackerRows = trackerResponse.data.values || [];

        console.log('>>> [SHEET DATA] History...');
        let historyData: Array<{
            id: string;
            timestamp: string;
            companyId: string;
            user: string;
            action: string;
            remark: string;
        }> = [];
        try {
            const historyResponse = await withSheetsRetry(
                () =>
                    sheets.spreadsheets.values.get({
                        spreadsheetId: trackerSpreadsheetId,
                        range: `Thread_History!A2:D`,
                    }),
                DATA_READ_MAX_ATTEMPTS,
                'sheet-data:history',
                dataReadRetryOpts,
            );
            historyData = (historyResponse.data.values || []).map((row, index) => ({
                id: `history-${index}`,
                timestamp: row[0],
                companyId: row[1],
                user: row[2],
                action: row[3] || '',
                remark: row[3] || '',
            }));
        } catch {
            console.warn('History fetch failed');
        }

        console.log('>>> [SHEET DATA] Daily Stats...');
        let dailyStats: DailyStatRow[] = [];
        let bootstrappedDailyStats = false;
        try {
            dailyStats = await fetchDailyStats(sheets, trackerSpreadsheetId);
        } catch {
            console.warn('Daily Stats fetch failed, sheet might not exist yet');
        }

        if (dailyStats.length === 0) {
            try {
                await syncDailyStats(sheets, trackerSpreadsheetId);
                dailyStats = await fetchDailyStats(sheets, trackerSpreadsheetId);
                bootstrappedDailyStats = dailyStats.length > 0;
            } catch (e) {
                console.warn('Daily Stats bootstrap failed:', e);
            }
        }

        console.log('>>> [SHEET DATA] Processing...');
        const trackerMap = new Map<string, Record<string, unknown>>();
        const normalizeId = (s: string) => (s || '').toString().trim();
        const cellTrim = (v: unknown) => (v ?? '').toString().trim();
        trackerRows.forEach((row) => {
            const rawId = row[0];
            if (!rawId) return;
            const id = normalizeId(rawId);
            if (!id) return;
            const contactStatusRaw = cellTrim(row[2]);
            trackerMap.set(id, {
                companyId: id,
                companyName: row[1],
                contactStatus: contactStatusRaw || 'To Contact',
                relationshipStatus: cellTrim(row[3]),
                channel: cellTrim(row[4]),
                urgencyScore: parseInt(row[5], 10) || 0,
                previousResponse: row[6],
                assignedPic: cellTrim(row[7]),
                lastCompanyContact: row[8],
                lastContact: row[9],
                followUpsCompleted: parseInt(row[10], 10) || 0,
                sponsorshipTier: cellTrim(row[12]),
                daysAttending: cellTrim(row[13]),
                remarks: cellTrim(row[14]),
                lastUpdate: row[15],
            });
        });

        const companyMap = new Map<string, SheetCompany>();
        dbRows.forEach((row, index) => {
            const rawId = row[0];
            if (!rawId) return;
            const id = normalizeId(rawId);
            if (!id) return;
            if (!companyMap.has(id)) {
                const t = trackerMap.get(id);
                companyMap.set(id, {
                    id,
                    companyName: (row[1] || t?.companyName || 'Unknown') as string,
                    contactStatus: (t?.contactStatus || 'To Contact') as string,
                    relationshipStatus: (t?.relationshipStatus || '') as string,
                    channel: (t?.channel || '') as string,
                    urgencyScore: (t?.urgencyScore || 0) as number,
                    pic: (t?.assignedPic || 'Unassigned') as string,
                    followUpsCompleted: (t?.followUpsCompleted || 0) as number,
                    sponsorshipTier: (t?.sponsorshipTier || '') as string,
                    remark: (t?.remarks || '') as string,
                    lastUpdated: (t?.lastUpdate || '') as string,
                    lastCompanyActivity: (t?.previousResponse || t?.lastUpdate || '') as string,
                    previousResponse: (t?.previousResponse || '') as string,
                    lastContact: (t?.lastContact || '') as string,
                    daysAttending: (t?.daysAttending || '') as string,
                    previousParticipationStatus: cellTrim(row[4]),
                    discipline: row[2],
                    targetSponsorshipTier: row[3],
                    reference: cellTrim(row[11]),
                    batchLabel: cellTrim(row[18]),
                    createdAt: cellTrim(row[19]),
                    isFlagged: false,
                    isDeleted: false,
                    contacts: [],
                });
            }
            const c = companyMap.get(id)!;
            const eParticipation = cellTrim(row[4]);
            if (eParticipation && !c.previousParticipationStatus) {
                c.previousParticipationStatus = eParticipation;
            }
            const isArchived = (row[15] || '').toString().trim().toUpperCase() === 'Y';
            c.isDeleted = c.isDeleted || isArchived;
            const hasContactInfo =
                (row[5] && row[5].trim()) ||
                (row[7] && row[7].trim()) ||
                (row[8] && row[8].trim()) ||
                (row[10] && row[10].trim()) ||
                cellTrim(row[11]);
            if (hasContactInfo) {
                (c.contacts as unknown[]).push({
                    id: `contact-${id}-${index}`,
                    rowNumber: index + 2,
                    name: row[5],
                    role: row[6],
                    email: row[7],
                    phone: row[8],
                    landline: row[9],
                    linkedin: row[10],
                    reference: cellTrim(row[11]),
                    remark: row[12],
                    isActive: row[13] === 'TRUE',
                    activeMethods: row[14] || '',
                    isEmailInvalid: (row[16] || '').toString().trim().toUpperCase() === 'TRUE',
                    isPhoneInvalid: (row[17] || '').toString().trim().toUpperCase() === 'TRUE',
                });
            }
        });

        const dbIds = new Set<string>();
        dbRows.forEach((row: string[]) => {
            const id = row[0]?.toString().trim();
            if (id) dbIds.add(id);
        });
        const trackerOnlyCompanies: Array<{ id: string; name: string }> = [];
        trackerRows.forEach((row: string[]) => {
            const id = row[0]?.toString().trim();
            const name = (row[1] || '').toString().trim();
            if (id && !dbIds.has(id)) {
                trackerOnlyCompanies.push({ id, name: name || id });
            }
        });

        const data = Array.from(companyMap.values()).filter(c => !c.isDeleted);
        data.forEach(c => {
            const companyHistory = historyData.filter(h => h.companyId === c.id);
            companyHistory.sort((a, b) => {
                const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
                const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
                return tB - tA;
            });
            c.history = companyHistory;
            if (!c.createdAt) {
                if (companyHistory.length > 0) {
                    c.createdAt = companyHistory[companyHistory.length - 1].timestamp || '';
                } else if (c.lastUpdated) {
                    c.createdAt = c.lastUpdated;
                }
            }
            const now = Date.now();
            const lu = c.lastUpdated ? new Date(c.lastUpdated as string).getTime() : 0;
            const la = c.lastCompanyActivity ? new Date(c.lastCompanyActivity as string).getTime() : 0;
            c.isCommitteeStale = (now - lu) / (1000 * 60 * 60 * 24) > 7;
            c.isCompanyStale = (now - la) / (1000 * 60 * 60 * 24) > 7;
        });

        console.log('>>> [SHEET DATA] Committee Members...');
        let committeeMembers: CommitteeMember[] = [];
        try {
            committeeMembers = await getCommitteeMembers();
        } catch {
            // optional
        }

        let idNameMismatches: Array<{ id: string; trackerName: string; dbName: string }> = [];
        if (refresh) {
            const normalizeIdUpper = (s: string) => s?.toString().trim().toUpperCase() || '';
            const normalizeName = (s: string) => s?.toLowerCase().replace(/\s+/g, ' ').trim() || '';
            const dbIdToName = new Map<string, string>();
            dbRows.forEach((row: string[]) => {
                const id = row[0]?.toString().trim();
                if (!id) return;
                const key = normalizeIdUpper(id);
                if (dbIdToName.has(key)) return;
                dbIdToName.set(key, (row[1] || '').toString().trim());
            });
            trackerRows.forEach((row: string[]) => {
                const id = row[0]?.toString().trim();
                const trackerName = (row[1] || '').toString().trim();
                if (!id || !trackerName) return;
                const dbName = dbIdToName.get(normalizeIdUpper(id));
                if (!dbName || normalizeName(trackerName) === normalizeName(dbName)) return;
                idNameMismatches.push({ id, trackerName, dbName });
            });
        }

        const responseData: SheetDataPayload = {
            companies: data,
            history: historyData,
            dailyStats,
            committeeMembers,
            idNameMismatches: idNameMismatches.length > 0 ? idNameMismatches : undefined,
            trackerOnlyCompanies: trackerOnlyCompanies.length > 0 ? trackerOnlyCompanies : undefined,
        };
        if (bootstrappedDailyStats) {
            cache.delete(SHEET_DATA_CACHE_KEY);
        }
        cache.set(SHEET_DATA_CACHE_KEY, responseData);

        console.log(`>>> [SHEET DATA] Done in ${Date.now() - startTime}ms`);
        return { ok: true, payload: responseData, cacheStatus: 'MISS' };
    } catch (error) {
        console.error('Sheet data error:', error);
        const stale = cache.get(SHEET_DATA_CACHE_KEY) as SheetDataPayload | undefined;
        if (stale && isRetryableSheetsError(error)) {
            console.warn('>>> [SHEET DATA] Serving stale cache after Sheets quota/transient error');
            return { ok: true, payload: stale, cacheStatus: 'STALE' };
        }
        const message = error instanceof Error ? error.message : 'Internal Server Error';
        const status = isRetryableSheetsError(error) ? 503 : 500;
        return {
            ok: false,
            message,
            status,
            ...(isRetryableSheetsError(error) ? { code: 'SHEETS_QUOTA_OR_UNAVAILABLE' as const } : {}),
        };
    }
}
