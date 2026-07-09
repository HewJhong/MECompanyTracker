/**
 * Persists the last successful `/api/data` payload (minus top-level history) in
 * the browser so pages consuming SheetDataContext can paint immediately while
 * a fresh request runs in the background.
 */
const CACHE_VERSION = 1 as const;
const STORAGE_KEY = `outreach_sheet_data_v${CACHE_VERSION}`;

export interface SheetDataLocalCachePayload {
    companies: unknown[];
    dailyStats?: unknown[];
    committeeMembers?: unknown[];
    idNameMismatches?: unknown[];
    trackerOnlyCompanies?: unknown[];
}

export interface SheetDataLocalCache {
    version: typeof CACHE_VERSION;
    savedAt: number;
    payload: SheetDataLocalCachePayload;
}

export function readSheetDataLocalCache(): SheetDataLocalCache | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<SheetDataLocalCache>;
        if (
            parsed.version !== CACHE_VERSION ||
            !parsed.payload ||
            !Array.isArray(parsed.payload.companies) ||
            parsed.payload.companies.length === 0
        ) {
            return null;
        }
        return {
            version: CACHE_VERSION,
            savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
            payload: {
                companies: parsed.payload.companies,
                dailyStats: Array.isArray(parsed.payload.dailyStats) ? parsed.payload.dailyStats : [],
                committeeMembers: Array.isArray(parsed.payload.committeeMembers) ? parsed.payload.committeeMembers : [],
                idNameMismatches: Array.isArray(parsed.payload.idNameMismatches) ? parsed.payload.idNameMismatches : [],
                trackerOnlyCompanies: Array.isArray(parsed.payload.trackerOnlyCompanies) ? parsed.payload.trackerOnlyCompanies : [],
            },
        };
    } catch {
        return null;
    }
}

export function writeSheetDataLocalCache(payload: SheetDataLocalCachePayload): void {
    if (typeof window === 'undefined') return;
    try {
        const body: SheetDataLocalCache = {
            version: CACHE_VERSION,
            savedAt: Date.now(),
            payload: {
                companies: payload.companies,
                dailyStats: Array.isArray(payload.dailyStats) ? payload.dailyStats : [],
                committeeMembers: Array.isArray(payload.committeeMembers) ? payload.committeeMembers : [],
                idNameMismatches: Array.isArray(payload.idNameMismatches) ? payload.idNameMismatches : [],
                trackerOnlyCompanies: Array.isArray(payload.trackerOnlyCompanies) ? payload.trackerOnlyCompanies : [],
            },
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(body));
    } catch (e) {
        console.warn('[sheet-data-local-cache] write failed', e);
    }
}
