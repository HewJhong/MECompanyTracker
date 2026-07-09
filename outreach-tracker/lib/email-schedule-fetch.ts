/**
 * In-memory dedup + short-TTL cache for `GET /api/email-schedule`.
 *
 * Unlike `/api/data` (shared across pages by `contexts/SheetDataContext.tsx`),
 * the schedule endpoint was fetched directly on every mount of the Email
 * Schedule board — so navigating back to the page within seconds always paid a
 * full network round-trip. `EmailScheduleBoard` unmounts on navigation, so its
 * React state can't bridge that gap; this cache lives at module scope so it
 * persists across the board's unmount/remount within a session.
 *
 * Mirrors the fresh-check / in-flight-dedup semantics of
 * `SheetDataContext.fetchSheetData`. Persistent (across full reloads) instant
 * paint is a separate concern handled by `lib/email-schedule-local-cache.ts`.
 */

export interface ScheduleEntry {
    companyId: string;
    companyName: string;
    pic: string;
    date: string;
    time: string;
    order: number;
    note?: string;
    completed?: string;
}

// Matches SheetDataContext's client TTL — kept under the server-side LRU TTL so
// a client "hit" never masks data the server already considers stale.
const CLIENT_CACHE_TTL_MS = 25_000;

let cachedEntries: ScheduleEntry[] | null = null;
let lastFetchedAt = 0;
let inFlight: Promise<ScheduleEntry[]> | null = null;

/**
 * Resolves the current schedule entries.
 *
 * - Non-forced call within {@link CLIENT_CACHE_TTL_MS} of the last success →
 *   returns the cached array without hitting the network.
 * - Non-forced call while a non-forced request is already in flight → joins it.
 * - Otherwise starts a new request and refreshes the cache on success.
 *
 * `forceRefresh` (used after mutations) always starts its own request and
 * updates the cache. A failed response throws and is **not** cached, so the
 * caller's existing try/catch surfaces it exactly as a direct fetch would.
 */
export async function fetchScheduleEntries(forceRefresh = false): Promise<ScheduleEntry[]> {
    const isFresh =
        !forceRefresh &&
        cachedEntries !== null &&
        Date.now() - lastFetchedAt < CLIENT_CACHE_TTL_MS;
    if (isFresh) {
        return cachedEntries!;
    }

    if (!forceRefresh && inFlight) {
        return inFlight;
    }

    const request = (async (): Promise<ScheduleEntry[]> => {
        const res = await fetch('/api/email-schedule');
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Failed to fetch schedule: ${res.status} ${text}`);
        }
        const json = await res.json();
        const entries = (json.entries || []) as ScheduleEntry[];
        cachedEntries = entries;
        lastFetchedAt = Date.now();
        return entries;
    })();

    inFlight = request;
    request.finally(() => {
        if (inFlight === request) {
            inFlight = null;
        }
    });

    return request;
}

/** Synchronous read of the last successfully fetched entries (null before any success). */
export function getCachedScheduleEntries(): ScheduleEntry[] | null {
    return cachedEntries;
}

/** Marks the cache stale without fetching. Not required today (mutations force-refresh); exported for future use. */
export function invalidateScheduleEntries(): void {
    lastFetchedAt = 0;
}
