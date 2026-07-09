import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import CommitteeWorkspace from './committee-workspace';
import PageContentLoader from './PageContentLoader';
import { useCurrentUser } from '../contexts/CurrentUserContext';
import { useSheetData } from '../contexts/SheetDataContext';
import { readSheetDataLocalCache } from '../lib/sheet-data-local-cache';

interface Company {
    id: string;
    companyName: string;
    name?: string;
    /** @deprecated Use contactStatus instead. Kept for compatibility. */
    status?: string;
    contactStatus?: string;
    relationshipStatus?: string;
    isFlagged: boolean;
    contacts: any[];
    lastUpdated?: string;
    pic?: string;
    history?: any[];
    discipline?: string;
    priority?: string;
    lastCompanyActivity?: string;
    previousResponse?: string;
    followUpsCompleted?: number;
    lastContact?: string;
}

function isSheetsQuotaError(message: string): boolean {
    return /quota|rate limit|429|resource exhausted/i.test(message);
}

function parseIsoLikeTimestamp(value?: string): number | null {
    if (!value || !/^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(value)) {
        return null;
    }
    const timestamp = new Date(value).getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
}

export default function CommitteeBoard() {
    const router = useRouter();
    const { user, loading: userLoading, isImpersonating, stopImpersonation } = useCurrentUser();
    const { fetchSheetData } = useSheetData();
    const initialCommittee = useMemo(() => {
        const cached = readSheetDataLocalCache();
        const companies = cached?.payload.companies;
        if (Array.isArray(companies) && companies.length > 0) {
            return { data: companies as Company[], loading: false };
        }
        return { data: [] as Company[], loading: true };
    }, []);
    const [data, setData] = useState<Company[]>(initialCommittee.data);
    const [loading, setLoading] = useState(initialCommittee.loading);
    // scheduleMap: companyId → next pending schedule { date, time, isOverdue, note? }
    const [scheduleMap, setScheduleMap] = useState<Record<string, { date: string; time: string; isOverdue: boolean; note?: string }>>({});
    const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Redirect to home if not authenticated
    useEffect(() => {
        if (!userLoading && !user) {
            router.push('/');
        }
    }, [userLoading, user, router]);

    const currentUser = user?.name ?? '';

    // forceRefresh must be true for any refetch triggered right after a write
    // (see scheduleRefresh below) — the shared SheetDataContext cache doesn't
    // know a mutation just happened, so a non-forced call could hand back the
    // pre-mutation payload if it's still within the client cache TTL.
    const fetchData = async (forceRefresh = false) => {
        const maxAttempts = 4;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const [responseData, schedRes] = await Promise.all([
                    fetchSheetData(forceRefresh),
                    fetch('/api/email-schedule'),
                ]);
                if (Array.isArray(responseData.companies)) {
                    setData(responseData.companies as Company[]);
                } else {
                    throw new Error('Invalid /api/data response shape: missing companies array');
                }

                if (schedRes.ok) {
                    const schedData = await schedRes.json();
                    const now = Date.now();
                    const map: Record<string, { date: string; time: string; isOverdue: boolean; note?: string }> = {};
                    const bestTsByCompany: Record<string, number> = {};
                    (schedData.entries || []).forEach((e: { companyId: string; date: string; time: string; completed?: string; note?: string }) => {
                        if (!e?.companyId || !e?.date || !e?.time) return;
                        if (e.completed === 'Y') return;
                        const ts = new Date(`${e.date}T${e.time}`).getTime();
                        if (!Number.isFinite(ts)) return;
                        const prev = bestTsByCompany[e.companyId];
                        if (prev === undefined || ts < prev) {
                            bestTsByCompany[e.companyId] = ts;
                            map[e.companyId] = { date: e.date, time: e.time, isOverdue: ts < now, note: e.note?.trim() || undefined };
                        }
                    });
                    setScheduleMap(map);
                }

                setLoading(false);
                return;
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                if (isSheetsQuotaError(msg) && attempt < maxAttempts) {
                    await new Promise(r => setTimeout(r, 2000 * attempt));
                    continue;
                }
                console.error('Failed to load data', err);
                setLoading(false);
                return;
            }
        }
    };

    /** Debounced so many bulk rows do not each trigger a full /api/data + Sheets burst. */
    const scheduleRefresh = useCallback(() => {
        if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
        refreshDebounceRef.current = setTimeout(() => {
            refreshDebounceRef.current = null;
            void fetchData(true);
        }, 800);
    }, []);

    useEffect(() => {
        void fetchData();
    }, []);

    useEffect(() => () => {
        if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
    }, []);

    // Filter companies assigned to current user
    const myCompanies = data.filter(c => c.pic === currentUser);

    // Transform data for CommitteeWorkspace component
    const transformedCompanies = myCompanies.map(company => {
        const staleThresholdDays = 3;

        // Warning Logic: Company Replied > Committee Contact > 3 Days
        const replyNeeded = (() => {
            if (!company.previousResponse || !company.lastContact) return false;

            const lastCommitteeContactDate = parseIsoLikeTimestamp(company.lastContact);
            const lastCompanyReplyDate = parseIsoLikeTimestamp(company.previousResponse);
            if (lastCommitteeContactDate === null || lastCompanyReplyDate === null) return false;

            const daysSinceReply = (Date.now() - lastCompanyReplyDate) / (1000 * 60 * 60 * 24);

            return (lastCompanyReplyDate > lastCommitteeContactDate) && (daysSinceReply > 3);
        })();

        const nextPendingSchedule = scheduleMap[company.id];
        const hasPendingSchedule = !!(nextPendingSchedule?.date && nextPendingSchedule?.time);

        const contactStatus = company.contactStatus || 'To Contact';
        const lastCommitteeContactAtMs = parseIsoLikeTimestamp(company.lastContact);
        const daysSinceCommitteeContact = lastCommitteeContactAtMs === null
            ? null
            : (Date.now() - lastCommitteeContactAtMs) / (1000 * 60 * 60 * 24);
        const isStale = contactStatus === 'To Contact'
            ? (hasPendingSchedule && !!nextPendingSchedule?.isOverdue)
            : (lastCommitteeContactAtMs === null || (daysSinceCommitteeContact !== null && daysSinceCommitteeContact > staleThresholdDays));

        return {
            id: company.id,
            name: company.companyName || company.name || '',
            contactStatus,
            relationshipStatus: company.relationshipStatus || '',
            followUpsCompleted: company.followUpsCompleted ?? 0,
            lastContact: company.lastContact || '',
            previousResponse: company.previousResponse || '',
            contact: (() => {
                const active = company.contacts?.filter((c: any) => c.isActive) || [];
                if (active.length > 0) {
                    return active.map((c: any) => {
                        let iconStr = '';
                        if (c.activeMethods?.includes('phone')) iconStr += '📱';
                        if (c.activeMethods?.includes('email')) iconStr += '✉️';
                        return `${c.name}${iconStr ? ` ${iconStr}` : ''}`;
                    }).join(' & ');
                }
                return company.contacts?.[0]?.name || '';
            })(),
            email: company.contacts?.[0]?.email || '',
            lastUpdated: company.lastUpdated || '',
            isFlagged: company.isFlagged,
            isStale,
            replyNeeded,
            // Show schedule badge for next pending schedule (overdue will be red)
            scheduledTime: hasPendingSchedule ? nextPendingSchedule?.time : undefined,
            scheduledDate: hasPendingSchedule ? nextPendingSchedule?.date : undefined,
            scheduledIsOverdue: hasPendingSchedule ? nextPendingSchedule?.isOverdue : undefined,
            scheduleNote: hasPendingSchedule ? nextPendingSchedule?.note : undefined,
        };
    });

    const handleCompanyClick = (companyId: string) => {
        router.push(`/companies/${encodeURIComponent(companyId)}?from=committee`);
    };

    if ((loading && data.length === 0) || userLoading) {
        return <PageContentLoader label="Loading workspace…" />;
    }

    return (
        <>
            {user && !user.isCommitteeMember && (
                <div className="mb-6 p-6 bg-amber-50 border border-amber-200 rounded-xl">
                    <h3 className="text-lg font-semibold text-amber-900 mb-2">Committee Workspace Not Available</h3>
                    <p className="text-amber-800">
                        You are signed in as <strong>{user.name || user.email}</strong>, but you don't have access to the committee workspace.
                    </p>
                    <p className="text-amber-700 mt-2 text-sm">
                        This page is only available for committee members. If you believe this is an error, please contact the administrator.
                    </p>
                </div>
            )}


            {/* Workspace Content */}
            {user?.isCommitteeMember && (
                <CommitteeWorkspace
                    companies={transformedCompanies}
                    memberName={currentUser}
                    onCompanyClick={handleCompanyClick}
                    onRefresh={scheduleRefresh}
                    canEditCompanies={Boolean(user.canEditCompanies)}
                    isImpersonating={isImpersonating}
                    onStopImpersonation={stopImpersonation}
                />
            )}
        </>
    );
}
