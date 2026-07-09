import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import { readSheetDataLocalCache, writeSheetDataLocalCache } from '../lib/sheet-data-local-cache';

/**
 * Loose shape of the /api/data payload. Each page keeps its own stricter
 * Company/HistoryEntry interfaces and narrows this on the way in — this type
 * only needs to describe the top-level envelope.
 */
export interface SheetDataPayload {
    companies: unknown[];
    history?: unknown[];
    dailyStats?: unknown[];
    committeeMembers?: unknown[];
    idNameMismatches?: unknown[];
    trackerOnlyCompanies?: unknown[];
    [key: string]: unknown;
}

// Slightly under the server's 30s LRU TTL (lib/cache.ts) so a cache "hit" here
// never masks server data that's already gone stale.
const CLIENT_CACHE_TTL_MS = 25_000;

/**
 * Resolves `promise` for this specific caller, rejecting early if `signal`
 * aborts — without touching `promise` itself. The underlying fetch is shared
 * across every caller currently waiting on it (see fetchSheetData), so one
 * caller's timeout/unmount must never be able to cancel a request that other
 * callers are still depending on.
 */
function raceWithSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return promise;
    if (signal.aborted) {
        return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
    }
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
        signal.addEventListener('abort', onAbort, { once: true });
        promise.then(
            (value) => {
                signal.removeEventListener('abort', onAbort);
                resolve(value);
            },
            (err) => {
                signal.removeEventListener('abort', onAbort);
                reject(err);
            }
        );
    });
}

interface SheetDataContextValue {
    /**
     * Every page previously called `fetch('/api/data...')` independently on
     * mount, so switching tabs always paid for a fresh network round trip
     * even when another page had just loaded the same data seconds earlier.
     * This shares one in-memory payload + in-flight request across all pages:
     * a call within CLIENT_CACHE_TTL_MS of the last successful fetch resolves
     * instantly from memory instead of hitting the network again.
     *
     * A `forceRefresh: true` call only ever joins (or starts) a request that
     * is itself forced — it never gets silently satisfied by a weaker,
     * already-in-flight non-forced request.
     */
    fetchSheetData: (forceRefresh?: boolean, signal?: AbortSignal) => Promise<SheetDataPayload>;
    /**
     * Marks the cached payload stale without fetching anything. Call this
     * after any write whose success handler updates local state optimistically
     * instead of calling fetchSheetData(true) itself — otherwise other pages
     * sharing this context can keep serving the pre-mutation snapshot for up
     * to CLIENT_CACHE_TTL_MS.
     */
    invalidate: () => void;
    /** Synchronous read of the current in-memory payload (seeded from localStorage on mount). */
    getCachedPayload: () => SheetDataPayload | null;
}

const SheetDataContext = createContext<SheetDataContextValue | null>(null);

export function SheetDataProvider({ children }: { children: React.ReactNode }) {
    const localCacheSeed = useMemo(() => readSheetDataLocalCache(), []);
    const payloadRef = useRef<SheetDataPayload | null>(
        localCacheSeed ? (localCacheSeed.payload as SheetDataPayload) : null
    );
    const lastFetchedAtRef = useRef<number>(localCacheSeed?.savedAt ?? 0);
    const inFlightRef = useRef<Promise<SheetDataPayload> | null>(null);
    const inFlightForceRef = useRef(false);
    const generationRef = useRef(0);

    const invalidate = useCallback(() => {
        lastFetchedAtRef.current = 0;
    }, []);

    const fetchSheetData = useCallback(async (forceRefresh = false, signal?: AbortSignal): Promise<SheetDataPayload> => {
        const isFresh =
            !forceRefresh &&
            payloadRef.current !== null &&
            Date.now() - lastFetchedAtRef.current < CLIENT_CACHE_TTL_MS;
        if (isFresh) {
            return payloadRef.current!;
        }

        // A forced call may only join an in-flight request that is itself
        // forced; otherwise it must start its own (which can run concurrently
        // with the weaker one already in progress).
        const canJoinInFlight = inFlightRef.current && (!forceRefresh || inFlightForceRef.current);
        if (canJoinInFlight) {
            return raceWithSignal(inFlightRef.current!, signal);
        }

        const myGeneration = ++generationRef.current;
        // Deliberately not passing `signal` to fetch() here — this request is
        // shared, so it must not be abortable by any single caller. Each
        // caller races its own signal against the shared promise instead.
        const newPromise = (async (): Promise<SheetDataPayload> => {
            const res = await fetch(`/api/data${forceRefresh ? '?refresh=true' : ''}`);
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Failed to fetch: ${res.status} ${text}`);
            }
            const data = (await res.json()) as SheetDataPayload;
            // Don't let an older request that resolves out of order clobber
            // data written by a request that started more recently.
            if (myGeneration === generationRef.current) {
                payloadRef.current = data;
                lastFetchedAtRef.current = Date.now();
                writeSheetDataLocalCache({
                    companies: data.companies,
                    dailyStats: data.dailyStats,
                    committeeMembers: data.committeeMembers,
                    idNameMismatches: data.idNameMismatches,
                    trackerOnlyCompanies: data.trackerOnlyCompanies,
                });
            }
            return data;
        })();

        inFlightRef.current = newPromise;
        inFlightForceRef.current = forceRefresh;
        newPromise.finally(() => {
            if (inFlightRef.current === newPromise) {
                inFlightRef.current = null;
                inFlightForceRef.current = false;
            }
        });

        return raceWithSignal(newPromise, signal);
    }, []);

    const getCachedPayload = useCallback((): SheetDataPayload | null => payloadRef.current, []);

    return (
        <SheetDataContext.Provider value={{ fetchSheetData, invalidate, getCachedPayload }}>
            {children}
        </SheetDataContext.Provider>
    );
}

export function useSheetData() {
    const ctx = useContext(SheetDataContext);
    if (!ctx) {
        throw new Error('useSheetData must be used within a SheetDataProvider');
    }
    return ctx;
}
