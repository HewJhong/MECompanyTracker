import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import DashboardStats from '../components/DashboardStats';
import MemberActivity from '../components/MemberActivity';
import FlaggedItems from '../components/FlaggedItems';
import CommitteeLeaderboard from '../components/CommitteeLeaderboard';
import Layout from '../components/Layout';
import LandingPage from '../components/LandingPage';
import { SparklesIcon } from '@heroicons/react/24/solid';
import Link from 'next/link';

interface Company {
    id: string;
    companyName: string;
    name?: string;
    status: string;
    isFlagged: boolean;
    contacts: any[];
    lastUpdated?: string;
    pic?: string;
    history?: any[];
    discipline?: string;
    priority?: string;
    followUpsCompleted?: number;
    lastCompanyActivity?: string;
}

interface HistoryEntry {
    id: string;
    timestamp: string;
    companyName: string;
    user: string;
    action: string;
    remark: string;
}

export default function Home() {
    const router = useRouter();
    const { data: session, status } = useSession();
    const [data, setData] = useState<Company[]>([]);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        try {
            const res = await fetch('/api/data');
            const responseData = await res.json();
            const companies = responseData.companies || [];
            const historyData = responseData.history || [];
            setData(companies);
            setHistory(historyData);
            setLoading(false);
        } catch (err) {
            console.error('Failed to load data', err);
            setLoading(false);
        }
    };

    useEffect(() => {
        if (session) {
            fetchData();
        }
    }, [session]);

    // Show landing page for unauthenticated users
    if (status === 'loading') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
            </div>
        );
    }

    if (!session) {
        return <LandingPage />;
    }

    // Compute Stats
    // ... rest of the logic remains same until handleCompanyClick
    // (Optimization: I'll include the full logic to ensure no regression)

    const totalCompanies = data.length;
    const contactedCount = data.filter(c =>
        c.status && c.status !== 'To Contact'
    ).length;

    const responseCount = data.filter(c =>
        ['Negotiating', 'Interested', 'Completed', 'Closed', 'Succeeded'].includes(c.status)
    ).length;

    const committeeStalledCount = data.filter(c => {
        if (!c.lastUpdated) return false;
        const daysSinceUpdate = (Date.now() - new Date(c.lastUpdated).getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceUpdate > 7;
    }).length;

    const companyStalledCount = data.filter(c => {
        if (c.status !== 'Contacted' || !c.lastCompanyActivity) return false;
        const daysSinceActivity = (Date.now() - new Date(c.lastCompanyActivity).getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceActivity > 7;
    }).length;

    const totalFollowUps = data.reduce((sum, c) => sum + (c.followUpsCompleted || 0), 0);
    const flaggedCount = data.filter(c => c.isFlagged).length;

    const flaggedCompanies = data.filter(c => c.isFlagged).map(c => ({
        id: c.id,
        name: c.companyName || c.name || '',
        status: c.status,
        assignedTo: c.pic || 'Unassigned',
        reason: 'Needs attention from lead',
        flaggedDate: c.lastUpdated || new Date().toISOString()
    }));

    const memberActivityMap = new Map<string, string>();
    history.forEach(entry => {
        if (entry.user && entry.timestamp) {
            const existingTime = memberActivityMap.get(entry.user);
            if (!existingTime || new Date(entry.timestamp) > new Date(existingTime)) {
                memberActivityMap.set(entry.user, entry.timestamp);
            }
        }
    });

    const realMembers = Array.from(memberActivityMap.entries()).map(([name, lastActive]) => ({
        name,
        lastActive
    }));

    const memberStatsMap = new Map<string, { totalAssigned: number; contactedCount: number; responseCount: number; followUps: number }>();
    data.forEach(company => {
        const pic = company.pic || 'Unassigned';
        if (!memberStatsMap.has(pic)) {
            memberStatsMap.set(pic, { totalAssigned: 0, contactedCount: 0, responseCount: 0, followUps: 0 });
        }
        const stats = memberStatsMap.get(pic)!;
        stats.totalAssigned++;
        stats.followUps += (company.followUpsCompleted || 0);
        if (company.status && company.status !== 'To Contact') stats.contactedCount++;
        if (['Negotiating', 'Interested', 'Completed', 'Closed', 'Succeeded'].includes(company.status)) stats.responseCount++;
    });

    const leaderboardMembers = Array.from(memberStatsMap.entries())
        .filter(([name]) => name !== 'Unassigned')
        .map(([name, stats]) => ({
            name,
            ...stats
        }));

    const handleCompanyClick = (companyId: string) => {
        router.push(`/companies/${encodeURIComponent(companyId)}`);
    };

    return (
        <Layout title="Command Center | Outreach Tracker">
            {/* Page Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl">
                        <SparklesIcon className="w-6 h-6 text-white" aria-hidden="true" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">Command Center</h1>
                        <p className="text-slate-600 mt-1">Real-time overview of sponsorship outreach progress</p>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center h-96">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mb-4"></div>
                    <p className="text-slate-600 font-medium">Loading dashboard data...</p>
                </div>
            ) : (
                <div className="space-y-8">
                    {/* Key Metrics */}
                    <DashboardStats
                        totalCompanies={totalCompanies}
                        contactedCount={contactedCount}
                        responseCount={responseCount}
                        committeeStalledCount={committeeStalledCount}
                        companyStalledCount={companyStalledCount}
                        totalFollowUps={totalFollowUps}
                        flaggedCount={flaggedCount}
                    />

                    {/* Main Content Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Left Column - Flagged Items & Leaderboard */}
                        <div className="lg:col-span-2 space-y-8">
                            <FlaggedItems
                                companies={flaggedCompanies}
                                onCompanyClick={handleCompanyClick}
                            />
                            <CommitteeLeaderboard members={leaderboardMembers} />

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Link href="/committee">
                                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-6 hover:shadow-lg transition-all cursor-pointer group">
                                        <div className="flex items-center gap-4">
                                            <div className="p-3 bg-blue-600 rounded-lg group-hover:scale-110 transition-transform">
                                                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                                </svg>
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="font-semibold text-slate-900 mb-1">My Workspace</h3>
                                                <p className="text-sm text-slate-600">View your assigned companies</p>
                                            </div>
                                        </div>
                                    </div>
                                </Link>

                                <Link href="/companies">
                                    <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-6 hover:shadow-lg transition-all cursor-pointer group">
                                        <div className="flex items-center gap-4">
                                            <div className="p-3 bg-green-600 rounded-lg group-hover:scale-110 transition-transform">
                                                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                </svg>
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="font-semibold text-slate-900 mb-1">All Companies</h3>
                                                <p className="text-sm text-slate-600">Browse master database</p>
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            </div>
                        </div>

                        <div>
                            <MemberActivity members={realMembers} />
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
}
