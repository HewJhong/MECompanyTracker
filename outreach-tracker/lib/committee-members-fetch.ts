/**
 * In-memory dedup + short-TTL cache for `GET /api/committee-members`.
 * Shared by Layout (sidebar) and Email Schedule (assignment balance chart).
 */
import {
    readCommitteeMembersLocalCache,
    writeCommitteeMembersLocalCache,
    type CommitteeMemberCacheEntry,
} from './committee-members-local-cache';

export type CommitteeMember = CommitteeMemberCacheEntry;

const CLIENT_CACHE_TTL_MS = 25_000;

let cachedMembers: CommitteeMember[] | null = null;
let lastFetchedAt = 0;
let inFlight: Promise<CommitteeMember[]> | null = null;
let seededFromStorage = false;

function normalizeMembers(raw: unknown[]): CommitteeMember[] {
    return raw
        .filter((m): m is Record<string, unknown> => Boolean(m && typeof m === 'object'))
        .filter((m) => m.email && String(m.email).trim() !== '')
        .map((m) => ({
            name: String(m.name || '').trim(),
            email: String(m.email || '').trim(),
            role: String(m.role || '').trim(),
        }))
        .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
}

function seedFromStorage(): void {
    if (seededFromStorage) return;
    seededFromStorage = true;
    const stored = readCommitteeMembersLocalCache();
    if (stored && stored.members.length > 0) {
        cachedMembers = stored.members;
        lastFetchedAt = stored.savedAt;
    }
}

/** Synchronous read of the last known members (localStorage seed, then in-memory). */
export function getCachedCommitteeMembers(): CommitteeMember[] | null {
    seedFromStorage();
    return cachedMembers;
}

export async function fetchCommitteeMembers(forceRefresh = false): Promise<CommitteeMember[]> {
    seedFromStorage();

    const isFresh =
        !forceRefresh &&
        cachedMembers !== null &&
        Date.now() - lastFetchedAt < CLIENT_CACHE_TTL_MS;
    if (isFresh) {
        return cachedMembers!;
    }

    if (!forceRefresh && inFlight) {
        return inFlight;
    }

    const request = (async (): Promise<CommitteeMember[]> => {
        const res = await fetch('/api/committee-members');
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Failed to fetch committee members: ${res.status} ${text}`);
        }
        const json = await res.json();
        const members = normalizeMembers(json.members || []);
        cachedMembers = members;
        lastFetchedAt = Date.now();
        if (members.length > 0) writeCommitteeMembersLocalCache(members);
        return members;
    })();

    inFlight = request;
    request.finally(() => {
        if (inFlight === request) {
            inFlight = null;
        }
    });

    return request;
}
