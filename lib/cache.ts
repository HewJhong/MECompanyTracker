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
