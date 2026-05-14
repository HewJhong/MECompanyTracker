/**
 * Persists the last successful `/api/data` companies payload in the browser so the
 * All Companies page can paint immediately while a fresh request runs in the background.
 */
const CACHE_VERSION = 1 as const;
const STORAGE_KEY = `outreach_companies_list_v${CACHE_VERSION}`;

export interface CompaniesListLocalCache {
    version: typeof CACHE_VERSION;
    savedAt: number;
    companies: unknown[];
    idNameMismatches: unknown[];
    trackerOnlyCompanies: unknown[];
}

export function readCompaniesListLocalCache(): CompaniesListLocalCache | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<CompaniesListLocalCache>;
        if (parsed.version !== CACHE_VERSION || !Array.isArray(parsed.companies) || parsed.companies.length === 0) {
            return null;
        }
        return {
            version: CACHE_VERSION,
            savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
            companies: parsed.companies,
            idNameMismatches: Array.isArray(parsed.idNameMismatches) ? parsed.idNameMismatches : [],
            trackerOnlyCompanies: Array.isArray(parsed.trackerOnlyCompanies) ? parsed.trackerOnlyCompanies : [],
        };
    } catch {
        return null;
    }
}

export function writeCompaniesListLocalCache(payload: {
    companies: unknown[];
    idNameMismatches?: unknown[];
    trackerOnlyCompanies?: unknown[];
}): void {
    if (typeof window === 'undefined') return;
    try {
        const body: CompaniesListLocalCache = {
            version: CACHE_VERSION,
            savedAt: Date.now(),
            companies: payload.companies,
            idNameMismatches: Array.isArray(payload.idNameMismatches) ? payload.idNameMismatches : [],
            trackerOnlyCompanies: Array.isArray(payload.trackerOnlyCompanies) ? payload.trackerOnlyCompanies : [],
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(body));
    } catch (e) {
        console.warn('[companies-list-local-cache] write failed', e);
    }
}
