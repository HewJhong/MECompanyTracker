/**
 * Persists committee members in the browser — small payload used to paint
 * assignment-balance bars immediately on the Email Schedule page.
 */
const CACHE_VERSION = 1 as const;
const STORAGE_KEY = `outreach_committee_members_v${CACHE_VERSION}`;

export interface CommitteeMemberCacheEntry {
    name: string;
    email: string;
    role: string;
}

export function readCommitteeMembersLocalCache(): {
    members: CommitteeMemberCacheEntry[];
    savedAt: number;
} | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<{
            version: number;
            savedAt: number;
            members: unknown[];
        }>;
        if (parsed.version !== CACHE_VERSION || !Array.isArray(parsed.members) || parsed.members.length === 0) {
            return null;
        }
        return {
            savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
            members: parsed.members as CommitteeMemberCacheEntry[],
        };
    } catch {
        return null;
    }
}

export function writeCommitteeMembersLocalCache(members: CommitteeMemberCacheEntry[]): void {
    if (typeof window === 'undefined') return;
    if (!members.length) return;
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ version: CACHE_VERSION, savedAt: Date.now(), members }),
        );
    } catch (e) {
        console.warn('[committee-members-local-cache] write failed', e);
    }
}
