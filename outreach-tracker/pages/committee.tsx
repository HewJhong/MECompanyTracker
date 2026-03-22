import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import CommitteeWorkspace from '../components/committee-workspace';
import { UserCircleIcon } from '@heroicons/react/24/outline';
import { useCurrentUser } from '../contexts/CurrentUserContext';

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

function parseIsoLikeTimestamp(value?: string): number | null {
    if (!value || !/^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(value)) {
        return null;
    }
    const timestamp = new Date(value).getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
}

export default function CommitteePage() {
    const router = useRouter();
    const { user, loading: userLoading } = useCurrentUser();
    const [data, setData] = useState<Company[]>([]);
    const [loading, setLoading] = useState(true);
    // scheduleMap: companyId → next pending schedule { date, time, isOverdue, note? }
    const [scheduleMap, setScheduleMap] = useState<Record<string, { date: string; time: string; isOverdue: boolean; note?: string }>>({});

    // Redirect to home if not authenticated
    useEffect(() => {
        if (!userLoading && !user) {
            router.push('/');
        }
    }, [userLoading, user, router]);

    const currentUser = user?.name ?? '';

    const fetchData = async () => {
        try {
            const [dataRes, schedRes] = await Promise.all([
                fetch('/api/data'),
                fetch('/api/email-schedule'),
            ]);
            const responseData = await dataRes.json();
            setData(responseData.companies || []);

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
        } catch (err) {
            console.error('Failed to load data', err);
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Filter companies assigned to current user
    const myCompanies = data.filter(c => c.pic === currentUser);

    // Transform data for CommitteeWorkspace component
    const transformedCompanies = myCompanies.map(company => {
        const daysSinceUpdate = company.lastUpdated
            ? (Date.now() - new Date(company.lastUpdated).getTime()) / (1000 * 60 * 60 * 24)
            : 0;

        // Warning Logic: Company Replied > Committee Contact > 3 Days
        const replyNeeded = (() => {
            if (!company.previousResponse || !company.lastContact) return false;

            const lastCommitteeContactDate = parseIsoLikeTimestamp(company.lastContact);
            const lastCompanyReplyDate = parseIsoLikeTimestamp(company.previousResponse);
            if (lastCommitteeContactDate === null || lastCompanyReplyDate === null) return false;

            const daysSinceReply = (Date.now() - lastCompanyReplyDate) / (1000 * 60 * 60 * 24);

            return (lastCompanyReplyDate > lastCommitteeContactDate) && (daysSinceReply > 3);
        })();

        const scheduled = scheduleMap[company.id];
        const showSchedule = !!(scheduled?.date && scheduled?.time);

        // Don't show stale for "To Contact" with no schedule — they haven't been scheduled yet
        const contactStatus = company.contactStatus || 'To Contact';
        const isStale = daysSinceUpdate > 7 && (
            contactStatus !== 'To Contact' || showSchedule
        );

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
            scheduledTime: showSchedule ? scheduled?.time : undefined,
            scheduledDate: showSchedule ? scheduled?.date : undefined,
            scheduledIsOverdue: showSchedule ? scheduled?.isOverdue : undefined,
            scheduleNote: showSchedule ? scheduled?.note : undefined,
        };
    });

    const handleCompanyClick = (companyId: string) => {
        router.push(`/companies/${encodeURIComponent(companyId)}?from=committee`);
    };

    if (loading || userLoading) {
        return (
            <Layout title="My Workspace | Outreach Tracker">
                <div className="flex flex-col items-center justify-center h-96">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mb-4"></div>
                    <p className="text-slate-600 font-medium">Loading workspace...</p>
                </div>
            </Layout>
        );
    }

    return (
        <Layout title="My Workspace | Outreach Tracker">
            {/* Page Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl">
                        <UserCircleIcon className="w-6 h-6 text-white" aria-hidden="true" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">Committee Workspace</h1>
                        <p className="text-slate-600 mt-1">Manage your assigned companies and track progress</p>
                    </div>
                </div>
            </div>


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
                    onRefresh={fetchData}
                />
            )}
        </Layout>
    );
}
