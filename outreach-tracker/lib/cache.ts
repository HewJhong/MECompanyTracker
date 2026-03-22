import { LRUCache } from 'lru-cache';

// Shared cache options
// NOTE: Cache is in-memory and process-local. In multi-instance deployments,
// one instance can serve stale data after another instance updates Sheets.
// TTL reduced to limit staleness window. Long-term: shared cache (e.g. Redis).
const options = {
    max: 500, // Maximum number of items
    ttl: 1000 * 30, // 30 seconds TTL (was 60s; reduced to limit cross-instance staleness)
    allowStale: false,
};

// Singleton cache instance
// @ts-ignore -- Global for dev HMR support if needed, but simple export works for now
export const cache = new LRUCache(options);

/** Delete all keys that equal one of the given keys or start with any prefix (prefix + '_'). */
export function deleteCacheKeysAndPrefix(exactKeys: string[], prefix?: string): void {
    if (typeof (cache as { keys?: () => IterableIterator<string> }).keys !== 'function') {
        exactKeys.forEach(k => cache.delete(k));
        return;
    }
    const keys = Array.from((cache as { keys: () => IterableIterator<string> }).keys());
    for (const k of keys) {
        if (typeof k !== 'string') continue;
        if (exactKeys.includes(k)) cache.delete(k);
        else if (prefix && k.startsWith(prefix + '_')) cache.delete(k);
    }
}
