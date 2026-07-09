/**
 * Persists the last successful `/api/email-schedule` payload in the browser so
 * the Email Schedule page can paint immediately while a fresh request runs in
 * the background.
 */
const CACHE_VERSION = 1 as const;
const STORAGE_KEY = `outreach_email_schedule_v${CACHE_VERSION}`;

export interface EmailScheduleLocalCache {
    version: typeof CACHE_VERSION;
    savedAt: number;
    entries: unknown[];
    settings?: unknown;
}

export function readEmailScheduleLocalCache(): EmailScheduleLocalCache | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<EmailScheduleLocalCache>;
        if (parsed.version !== CACHE_VERSION || !Array.isArray(parsed.entries)) {
            return null;
        }
        return {
            version: CACHE_VERSION,
            savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
            entries: parsed.entries,
            settings: parsed.settings,
        };
    } catch {
        return null;
    }
}

export function writeEmailScheduleLocalCache(payload: {
    entries: unknown[];
    settings?: unknown;
}): void {
    if (typeof window === 'undefined') return;
    try {
        const body: EmailScheduleLocalCache = {
            version: CACHE_VERSION,
            savedAt: Date.now(),
            entries: payload.entries,
            settings: payload.settings,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(body));
    } catch (e) {
        console.warn('[email-schedule-local-cache] write failed', e);
    }
}
