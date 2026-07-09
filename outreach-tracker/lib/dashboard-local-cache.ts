/**
 * Persists the last successful dashboard payload (companies, dailyStats, limits)
 * in the browser so the Command Center page can paint immediately while a fresh
 * request runs in the background.
 *
 * Top-level history is excluded — it is ~1.7MB and causes QuotaExceededError on
 * write, which silently disabled instant paint. Member activity reconciles once
 * `/api/data` resolves.
 */
const CACHE_VERSION = 2 as const;
const STORAGE_KEY = `outreach_dashboard_v${CACHE_VERSION}`;

export interface DashboardLocalCache {
    version: typeof CACHE_VERSION;
    savedAt: number;
    companies: unknown[];
    dailyStats: unknown[];
    limits: unknown[];
}

export function readDashboardLocalCache(): DashboardLocalCache | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<DashboardLocalCache>;
        if (parsed.version !== CACHE_VERSION || !Array.isArray(parsed.companies) || parsed.companies.length === 0) {
            return null;
        }
        return {
            version: CACHE_VERSION,
            savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
            companies: parsed.companies,
            dailyStats: Array.isArray(parsed.dailyStats) ? parsed.dailyStats : [],
            limits: Array.isArray(parsed.limits) ? parsed.limits : [],
        };
    } catch {
        return null;
    }
}

export function writeDashboardLocalCache(payload: {
    companies: unknown[];
    dailyStats?: unknown[];
    limits?: unknown[];
}): void {
    if (typeof window === 'undefined') return;
    if (!payload.companies || payload.companies.length === 0) return;
    try {
        const body: DashboardLocalCache = {
            version: CACHE_VERSION,
            savedAt: Date.now(),
            companies: payload.companies,
            dailyStats: Array.isArray(payload.dailyStats) ? payload.dailyStats : [],
            limits: Array.isArray(payload.limits) ? payload.limits : [],
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(body));
    } catch (e) {
        console.warn('[dashboard-local-cache] write failed', e);
    }
}
