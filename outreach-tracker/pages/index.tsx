import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import Layout from '../components/Layout';
import LandingPage from '../components/LandingPage';
import MemberActivity from '../components/MemberActivity';
import {
    SparklesIcon,
    ChartBarIcon,
    ArrowTrendingUpIcon,
    ArrowPathIcon,
    FlagIcon,
    CheckCircleIcon
} from '@heroicons/react/24/outline';
import { SparklesIcon as SolidSparkles } from '@heroicons/react/24/solid';

interface Company {
    id: string;
    companyName: string;
    name?: string;
    contactStatus: string;
    relationshipStatus: string;
    isFlagged: boolean;
    contacts: any[];
    lastUpdated?: string;
    pic?: string;
    discipline?: string;
    priority?: string;
    followUpsCompleted?: number;
    lastCompanyActivity?: string;
    sponsorshipTier?: string;
    daysAttending?: string;
    remark?: string;
}

interface HistoryEntry {
    id: string;
    timestamp: string;
    companyName: string;
    user: string;
    action: string;
    remark: string;
}

type TimelineMetric = 'contacted' | 'interested' | 'registered';

function OutreachPerformanceLineChart({ timeline }: { timeline: { date: string; contacted: number; interested: number; registered: number }[] }) {
    const [metric, setMetric] = useState<TimelineMetric>('contacted');
    const chartWidth = 600;
    const chartHeight = 200;
    const padding = { top: 8, right: 8, bottom: 24, left: 36 };

    const values = timeline.map(p => p[metric]);
    const maxValFromData = Math.max(...values, 1);

    // Round up the max value to a nice number for the scale
    const orderOfMagnitude = Math.floor(Math.log10(maxValFromData));
    const step = Math.pow(10, orderOfMagnitude);
    let topScale = Math.ceil(maxValFromData / step) * step;
    if (topScale - maxValFromData < step * 0.1) topScale += step;

    // Define exact scale markers (0, 1/4, 1/2, 3/4, Max)
    const scaleMarkers = [
        Math.round(topScale),
        Math.round(topScale * 0.75),
        Math.round(topScale * 0.5),
        Math.round(topScale * 0.25),
        0
    ];

    const maxVal = topScale;
    const minVal = 0;
    const range = maxVal - minVal || 1;
    const innerWidth = chartWidth - padding.left - padding.right;
    const innerHeight = chartHeight - padding.top - padding.bottom;

    const points = timeline.map((p, i) => {
        const x = padding.left + (i / Math.max(timeline.length - 1, 1)) * innerWidth;
        const y = padding.top + innerHeight - ((p[metric] - minVal) / range) * innerHeight;
        return `${x},${y}`;
    }).join(' ');

    const strokeColor = metric === 'contacted' ? '#3b82f6' : metric === 'interested' ? '#a855f7' : '#22c55e';

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col h-full">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Outreach Performance Over Time</h3>
                <select
                    value={metric}
                    onChange={(e) => setMetric(e.target.value as TimelineMetric)}
                    className="text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    aria-label="Select metric to display"
                >
                    <option value="contacted">Contacted</option>
                    <option value="interested">Interested</option>
                    <option value="registered">Registered</option>
                </select>
            </div>
            <div className="relative w-full flex-1 flex">
                {/* Y-Axis Scale Labels */}
                <div className="flex flex-col justify-between items-end pr-3 text-[10px] font-medium text-slate-400 pb-[24px]" style={{ height: `${chartHeight}px` }}>
                    {scaleMarkers.map((marker, i) => (
                        <span key={i} className={`leading-none ${i === scaleMarkers.length - 1 ? 'translate-y-1' : ''}`}>{marker}</span>
                    ))}
                </div>

                {/* Graph Area */}
                <div className="relative flex-1 h-full">
                    {/* Horizontal Grid Lines */}
                    <div className="absolute inset-0 flex flex-col justify-between pb-[24px]" style={{ height: `${chartHeight}px` }}>
                        {scaleMarkers.map((_, i) => (
                            <div key={i} className={`w-full border-t border-slate-100 ${i === scaleMarkers.length - 1 ? 'border-t-slate-200' : ''}`} />
                        ))}
                    </div>

                    <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                        <defs>
                            <linearGradient id="lineGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor={strokeColor} stopOpacity="0.3" />
                                <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
                            </linearGradient>
                        </defs>
                        {timeline.length > 0 && (
                            <>
                                <polyline
                                    fill="none"
                                    stroke={strokeColor}
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    points={points}
                                />
                                <polygon
                                    fill="url(#lineGrad)"
                                    points={`${padding.left},${padding.top + innerHeight} ${points} ${padding.left + innerWidth},${padding.top + innerHeight}`}
                                />
                            </>
                        )}
                    </svg>
                </div>
            </div>
            <div className="flex justify-between mt-auto pt-2 text-[10px] text-slate-400 font-medium pl-6">
                <span>{timeline[0]?.date}</span>
                <span>30 day cumulative</span>
                <span>{timeline[timeline.length - 1]?.date}</span>
            </div>
        </div>
    );
}

export default function Home() {
    const router = useRouter();
    const { data: session, status: authStatus } = useSession();
    const [data, setData] = useState<Company[]>([]);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [dailyStats, setDailyStats] = useState<any[]>([]);
    const [limits, setLimits] = useState<{ tier: string; total: number; daily: number }[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchData = async (refresh = false) => {
        if (refresh) setRefreshing(true);
        try {
            const [dataRes, limitsRes] = await Promise.all([
                fetch(`/api/data${refresh ? '?refresh=true' : ''}`),
                fetch('/api/limits')
            ]);
            const responseData = await dataRes.json();
            const limitsData = limitsRes.ok ? await limitsRes.json() : { limits: [] };

            setData(responseData.companies || []);
            setHistory(responseData.history || []);
            setDailyStats(responseData.dailyStats || []);
            setLimits(limitsData.limits || []);

            setLoading(false);
        } catch (err) {
            console.error('Failed to load data', err);
            setLoading(false);
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        if (session) {
            fetchData();
        }
    }, [session]);

    const stats = useMemo(() => {
        if (data.length === 0) return null;

        const total = data.length;
        const reached = data.filter(c => c.contactStatus !== 'To Contact').length;
        const registered = data.filter(c => c.relationshipStatus === 'Registered').length;
        const interested = data.filter(c => c.relationshipStatus === 'Interested').length;
        const contacted = data.filter(c => c.contactStatus === 'Contacted').length;
        const noReply = data.filter(c => c.contactStatus === 'No Reply').length;
        const rejected = data.filter(c => c.relationshipStatus === 'Rejected').length;
        const totalFollowUps = data.reduce((acc, c) => acc + (c.followUpsCompleted || 0), 0);
        const flaggedCount = data.filter(c => c.isFlagged).length;

        // Stalled Logic
        const committeeStalledCount = data.filter(c => {
            if (!c.lastUpdated) return false;
            const daysSinceUpdate = (Date.now() - new Date(c.lastUpdated).getTime()) / (1000 * 60 * 60 * 24);
            return daysSinceUpdate > 7;
        }).length;

        const companyStalledCount = data.filter(c => {
            if (c.contactStatus !== 'Contacted' || !c.lastCompanyActivity) return false;
            const daysSinceActivity = (Date.now() - new Date(c.lastCompanyActivity).getTime()) / (1000 * 60 * 60 * 24);
            return daysSinceActivity > 7;
        }).length;

        // Distributions
        const sponsorshipDist: Record<string, number> = {};
        const disciplineDist: Record<string, number> = {};
        const dayDist: Record<string, number> = {};
        const dayTierBreakdown: Record<string, Record<string, number>> = {};

        data.forEach(c => {
            if (c.relationshipStatus === 'Registered' && c.sponsorshipTier) {
                sponsorshipDist[c.sponsorshipTier] = (sponsorshipDist[c.sponsorshipTier] || 0) + 1;
            }
            if (c.discipline) {
                c.discipline.split(',').forEach(d => {
                    const trimmed = d.trim();
                    if (trimmed) disciplineDist[trimmed] = (disciplineDist[trimmed] || 0) + 1;
                });
            }
            if (c.daysAttending) {
                c.daysAttending.split(',').forEach(d => {
                    const trimmed = d.trim();
                    if (trimmed) {
                        dayDist[trimmed] = (dayDist[trimmed] || 0) + 1;
                        if (c.relationshipStatus === 'Registered' && c.sponsorshipTier) {
                            if (!dayTierBreakdown[trimmed]) dayTierBreakdown[trimmed] = {};
                            dayTierBreakdown[trimmed][c.sponsorshipTier] = (dayTierBreakdown[trimmed][c.sponsorshipTier] || 0) + 1;
                        }
                    }
                });
            }
        });

        // Committee Leaderboard
        const memberStats = new Map<string, { registered: number; assigned: number; contacted: number; followUps: number }>();
        data.forEach(c => {
            const pic = c.pic || 'Unassigned';
            if (!memberStats.has(pic)) {
                memberStats.set(pic, { registered: 0, assigned: 0, contacted: 0, followUps: 0 });
            }
            const s = memberStats.get(pic)!;
            s.assigned++;
            s.followUps += (c.followUpsCompleted || 0);
            if (c.relationshipStatus === 'Registered') s.registered++;
            if (c.contactStatus !== 'To Contact') s.contacted++;
        });

        const leaderboard = Array.from(memberStats.entries())
            .filter(([name]) => name !== 'Unassigned')
            .map(([name, s]) => ({
                name,
                registered: s.registered,
                contacted: s.contacted,
                assigned: s.assigned,
                totalFollowUps: s.followUps,
                percentage: s.assigned > 0 ? Math.round((s.contacted / s.assigned) * 100) : 0
            }))
            .sort((a, b) => b.registered - a.registered || b.percentage - a.percentage);

        // Timeline Data (Last 30 days) using explicit DailyStats
        const cumulativeTimeline: { date: string; contacted: number; interested: number; registered: number }[] = [];
        const daysToShow = 30;
        const now = new Date();
        for (let i = daysToShow; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' }); // YYYY-MM-DD

            // Find most recent stat for this date or earlier
            const pastStats = dailyStats.filter(s => s.date <= dateStr).sort((a, b) => b.date.localeCompare(a.date));
            const stat = pastStats[0];

            if (stat) {
                cumulativeTimeline.push({
                    date: dateStr.substring(5).replace('-', '/'),
                    contacted: (stat.contacted || 0) + (stat.interested || 0) + (stat.registered || 0) + (stat.noReply || 0),
                    interested: (stat.interested || 0) + (stat.registered || 0),
                    registered: stat.registered || 0
                });
            } else {
                cumulativeTimeline.push({
                    date: dateStr.substring(5).replace('-', '/'),
                    contacted: 0,
                    interested: 0,
                    registered: 0
                });
            }
        }

        // Member Activity
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
        })).sort((a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime());

        return {
            total,
            reached,
            registered,
            interested,
            contacted,
            noReply,
            rejected,
            totalFollowUps,
            flaggedCount,
            committeeStalledCount,
            companyStalledCount,
            sponsorshipDist,
            disciplineDist,
            dayDist,
            dayTierBreakdown,
            leaderboard,
            timeline: cumulativeTimeline,
            realMembers,
            flagged: data.filter(c => c.isFlagged)
        };
    }, [data, history]);

    if (authStatus === 'loading') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
            </div>
        );
    }

    if (!session) {
        return <LandingPage />;
    }

    const handleCompanyClick = (companyId: string) => {
        router.push(`/companies/${encodeURIComponent(companyId)}`);
    };

    return (
        <Layout title="Command Center | Outreach Tracker">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl">
                        <SolidSparkles className="w-6 h-6 text-white" aria-hidden="true" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Command Center</h1>
                        <p className="text-slate-500">Real-time overview of sponsorship outreach progress</p>
                    </div>
                </div>
                <button
                    onClick={() => fetchData(true)}
                    disabled={refreshing}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50"
                >
                    <ArrowPathIcon className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                    Refresh Stats
                </button>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center h-96">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mb-4"></div>
                    <p className="text-slate-600 font-medium">Loading command center...</p>
                </div>
            ) : !stats ? (
                <div className="bg-white rounded-2xl p-12 text-center border-2 border-dashed border-slate-200">
                    <p className="text-slate-400">No outreach data available yet.</p>
                </div>
            ) : (
                <div className="space-y-8">
                    {/* Row 1: Key Metrics */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {/* Outreach Progress - left: gauge, right: numbers */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col">
                            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Outreach Progress</h3>
                            <div className="flex items-center gap-4 flex-1 min-h-[100px]">
                                <div className="relative w-16 h-16 flex-shrink-0" aria-hidden="true">
                                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
                                        <circle cx="18" cy="18" r="15" stroke="currentColor" strokeWidth="3" fill="transparent" className="text-slate-100" />
                                        <circle cx="18" cy="18" r="15" stroke="currentColor" strokeWidth="3" fill="transparent"
                                            strokeDasharray={2 * Math.PI * 15}
                                            strokeDashoffset={2 * Math.PI * 15 * (1 - (stats.reached / stats.total))}
                                            className="text-blue-600 transition-all duration-1000 ease-out"
                                        />
                                    </svg>
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <span className="text-base font-bold text-slate-900">{Math.round((stats.reached / stats.total) * 100)}%</span>
                                    </div>
                                </div>
                                <div className="min-w-0 flex flex-col justify-center">
                                    <p className="text-3xl font-bold text-slate-900 leading-tight">{stats.reached} <span className="text-slate-400 font-normal text-lg">/ {stats.total}</span></p>
                                    <p className="text-sm text-slate-500 mt-1"><span className="font-bold text-amber-500">{stats.companyStalledCount}</span> Awaiting Reply</p>
                                </div>
                            </div>
                        </div>

                        {/* Total Follow-up - left: icon, right: numbers */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col group">
                            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Total Follow-up</h3>
                            <div className="flex items-center gap-4 flex-1 min-h-[100px]">
                                <div className="flex-shrink-0 p-2 rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100 transition-colors duration-200" aria-hidden="true">
                                    <ArrowTrendingUpIcon className="w-10 h-10" />
                                </div>
                                <div className="flex flex-col justify-center min-w-0">
                                    <p className="text-3xl font-bold text-slate-900">{stats.totalFollowUps}</p>
                                    <p className="text-xs text-slate-400 mt-1">Interactions logged</p>
                                </div>
                            </div>
                        </div>

                        {/* Sponsorship Tiers */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col lg:col-span-2">
                            <div className="flex items-center gap-2 mb-4">
                                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sponsorship Tiers</h3>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
                                {(limits.length > 0 ? limits.map(l => l.tier) : ['OP', 'Gold', 'Silver', 'Bronze']).map(tier => {
                                    const count = stats.sponsorshipDist[tier] || 0;
                                    const limit = limits.find(l => l.tier === tier)?.total || 0;
                                    const progress = limit > 0 ? Math.min((count / limit) * 100, 100) : count > 0 ? 100 : 0;
                                    const isOverLimit = limit > 0 && count > limit;

                                    return (
                                        <div key={tier} className="flex flex-col gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-3 h-3 rounded-full ${tier === 'OP' ? 'bg-blue-500' : tier === 'Gold' ? 'bg-amber-400' : tier === 'Silver' ? 'bg-slate-300' : tier === 'Bronze' ? 'bg-amber-700' : 'bg-slate-400'}`} />
                                                    <span className="text-sm font-semibold text-slate-700">{tier}</span>
                                                </div>
                                                <div className="flex items-baseline gap-1">
                                                    <span className={`text-lg font-bold ${isOverLimit ? 'text-red-600' : 'text-slate-900'}`}>{count}</span>
                                                    {limit > 0 && <span className="text-sm font-medium text-slate-400">/ {limit}</span>}
                                                </div>
                                            </div>
                                            {limit > 0 && (
                                                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-1000 ease-out ${isOverLimit ? 'bg-red-500' : tier === 'OP' ? 'bg-blue-500' : tier === 'Gold' ? 'bg-amber-400' : tier === 'Silver' ? 'bg-slate-400' : tier === 'Bronze' ? 'bg-amber-700' : 'bg-slate-500'}`}
                                                        style={{ width: `${progress}%` }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Outreach Breakdown - pie left, numbers right */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
                        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-6">Outreach Breakdown</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                            {[
                                { label: 'Registered', count: stats.registered, color: 'bg-green-500', strokeColor: 'stroke-green-500' },
                                { label: 'Interested', count: stats.interested, color: 'bg-orange-500', strokeColor: 'stroke-orange-500' },
                                { label: 'Rejected', count: stats.rejected, color: 'bg-red-500', strokeColor: 'stroke-red-500' },
                                { label: 'No Reply', count: stats.noReply, color: 'bg-slate-400', strokeColor: 'stroke-slate-400' },
                            ].map(item => {
                                const pct = stats.total > 0 ? (item.count / stats.total) * 100 : 0;
                                const r = 18;
                                const circ = 2 * Math.PI * r;
                                const offset = circ * (1 - item.count / stats.total);
                                return (
                                    <div key={item.label} className="flex items-center gap-4 p-4 rounded-xl bg-slate-50/80 border border-slate-100">
                                        <div className="relative w-16 h-16 flex-shrink-0" aria-hidden="true">
                                            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 44 44">
                                                <circle cx="22" cy="22" r={r} stroke="currentColor" strokeWidth="5" fill="transparent" className="text-slate-200" />
                                                <circle cx="22" cy="22" r={r} stroke="currentColor" strokeWidth="5" fill="transparent"
                                                    strokeDasharray={circ} strokeDashoffset={stats.total > 0 ? offset : circ}
                                                    className={`${item.strokeColor} transition-all duration-1000 ease-out`}
                                                />
                                            </svg>
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <span className="text-xs font-bold text-slate-700 tabular-nums">{Math.round(pct)}%</span>
                                            </div>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{item.label}</p>
                                            <p className="text-2xl font-bold text-slate-900 tabular-nums leading-tight mt-0.5">{item.count}</p>
                                            <p className="text-[10px] text-slate-400 mt-0.5">of {stats.total} total</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Main Content Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Left & Middle Columns */}
                        <div className="lg:col-span-2">

                            {/* Day Attendance */}
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 h-full flex flex-col">
                                <div className="flex items-center gap-2 mb-6">
                                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                        Day Attendance
                                    </h3>
                                </div>
                                {(() => {
                                    const displayDayDist = stats.dayDist;
                                    const displayDayTier = stats.dayTierBreakdown;
                                    const displayDayTierSlots: Record<string, Record<string, number>> = {};
                                    const tierOrder = ['OP', 'Gold', 'Silver', 'Bronze'];
                                    const tierOrderStackedBar = ['OP', 'Bronze', 'Silver', 'Gold'];
                                    const tierColors: Record<string, string> = { OP: 'bg-blue-500', Gold: 'bg-amber-400', Silver: 'bg-slate-300', Bronze: 'bg-amber-700' };
                                    const maxHeight = Math.max(...Object.values(displayDayDist), 1);
                                    return (
                                        <div className="space-y-5 flex-1 flex flex-col">
                                            <div className="flex items-stretch justify-between gap-3 flex-1">
                                                {[1, 2, 3, 4].map(day => {
                                                    const dayKey = day.toString();
                                                    const count = displayDayDist[dayKey] || 0;
                                                    const tiers = displayDayTier[dayKey] || {};
                                                    const slots = displayDayTierSlots[dayKey] || {};
                                                    const totalTier = tierOrder.reduce((sum, t) => sum + (tiers[t] || 0), 0);
                                                    return (
                                                        <div key={day} className="flex-1 flex flex-col items-center gap-2 min-w-0">
                                                            <div className="w-full text-center">
                                                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Day {day}</p>
                                                                <p className="text-2xl font-bold text-slate-900 tabular-nums mt-0.5">{count}</p>
                                                                <p className="text-[10px] text-slate-400 font-medium">companies</p>
                                                            </div>
                                                            <div className="w-full rounded-t-md relative flex flex-col-reverse overflow-hidden border border-blue-100 bg-blue-50/80" style={{ height: '100px' }} title="Empty area = vacancies">
                                                                {totalTier > 0 ? (
                                                                    <div className="w-full flex flex-col-reverse" style={{ height: `${(count / maxHeight) * 100}%` }}>
                                                                        {tierOrderStackedBar.map(tier => {
                                                                            const n = tiers[tier] || 0;
                                                                            if (n === 0) return null;
                                                                            return (
                                                                                <div key={tier} className={`w-full ${tierColors[tier]} min-h-[3px] transition-all duration-1000`} style={{ height: `${(n / totalTier) * 100}%` }} title={`${tier}: ${n}`} />
                                                                            );
                                                                        })}
                                                                    </div>
                                                                ) : (
                                                                    <div className="w-full bg-gradient-to-t from-blue-600 to-indigo-500 transition-all duration-1000" style={{ height: `${(count / maxHeight) * 100}%` }} />
                                                                )}
                                                            </div>
                                                            {totalTier > 0 && (
                                                                <div className="w-full space-y-1.5 pt-1">
                                                                    {tierOrder.filter(t => (tiers[t] || 0) > 0).map(t => {
                                                                        const current = tiers[t] || 0;
                                                                        const max = slots[t];
                                                                        const countLabel = max != null ? `${current}/${max}` : String(current);
                                                                        return (
                                                                            <div key={t} className="flex items-center justify-between gap-2 text-xs">
                                                                                <span className="flex items-center gap-1.5 font-medium text-slate-600 min-w-0">
                                                                                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${tierColors[t]}`} />
                                                                                    <span className="truncate">{t}</span>
                                                                                </span>
                                                                                <span className="font-bold text-slate-900 tabular-nums flex-shrink-0">{countLabel}</span>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            {Object.keys(displayDayTier[Object.keys(displayDayTier)[0]] || {}).length > 0 && (
                                                <div className="flex flex-wrap items-center gap-4 pt-4 mt-auto border-t border-slate-200 justify-center text-xs font-semibold text-slate-600">
                                                    {tierOrder.map(t => <span key={t} className="flex items-center gap-2"><span className={`w-3 h-3 rounded-full ${tierColors[t]}`} /> {t}</span>)}
                                                    <span className="flex items-center gap-2 text-slate-400 font-medium"><span className="w-3 h-3 rounded border border-blue-200 bg-blue-50" /> Vacancies</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* Outreach Performance Over Time - line chart with metric filter */}
                        <OutreachPerformanceLineChart timeline={stats.timeline} />

                    </div>

                    {/* Right Column - Flags */}
                    <div className="space-y-8">
                        {/* Flagged Items Mini */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="p-4 bg-red-50 border-b border-red-100 flex items-center justify-between">
                                <h3 className="text-[10px] font-bold text-red-600 uppercase tracking-widest flex items-center gap-2">
                                    <FlagIcon className="w-3 h-3" />
                                    Flagged
                                </h3>
                                <span className="text-[10px] font-bold text-red-600 px-1.5 py-0.5 bg-white rounded-md border border-red-100">{stats.flagged.length}</span>
                            </div>
                            <div className="p-2 space-y-2">
                                {stats.flagged.slice(0, 3).map(c => (
                                    <div
                                        key={c.id}
                                        onClick={() => handleCompanyClick(c.id)}
                                        className="p-3 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer group"
                                    >
                                        <h4 className="text-xs font-bold text-slate-900 group-hover:text-blue-600 transition-colors uppercase tracking-tight">{c.companyName}</h4>
                                        <p className="text-[10px] text-slate-500 mt-1 line-clamp-2 italic">"{c.remark || 'Attention required'}"</p>
                                    </div>
                                ))}
                                {stats.flagged.length === 0 && (
                                    <div className="py-8 text-center">
                                        <CheckCircleIcon className="w-8 h-8 text-green-200 mx-auto mb-2" />
                                        <p className="text-[10px] text-slate-400 font-medium tracking-tight">System All Clear</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #e2e8f0;
                    border-radius: 10px;
                }
            `}</style>
        </Layout>
    );
}
