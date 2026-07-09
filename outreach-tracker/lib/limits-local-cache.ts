/**
 * Persists sponsorship tier limits separately — the payload is tiny (~200 bytes)
 * so it always fits in localStorage even when the dashboard cache fails to write.
 */
const CACHE_VERSION = 1 as const;
const STORAGE_KEY = `outreach_limits_v${CACHE_VERSION}`;

export interface SponsorshipLimit {
    tier: string;
    total: number;
    daily: number;
}

export function readLimitsLocalCache(): SponsorshipLimit[] | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<{ version: number; limits: unknown[] }>;
        if (parsed.version !== CACHE_VERSION || !Array.isArray(parsed.limits) || parsed.limits.length === 0) {
            return null;
        }
        return parsed.limits as SponsorshipLimit[];
    } catch {
        return null;
    }
}

export function writeLimitsLocalCache(limits: SponsorshipLimit[]): void {
    if (typeof window === 'undefined') return;
    if (!limits.length) return;
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ version: CACHE_VERSION, savedAt: Date.now(), limits }),
        );
    } catch (e) {
        console.warn('[limits-local-cache] write failed', e);
    }
}
