import { LRUCache } from 'lru-cache';

// Shared cache options
const options = {
    max: 500, // Maximum number of items
    ttl: 1000 * 60, // 1 minute TTL
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
