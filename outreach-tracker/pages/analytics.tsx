import { useEffect, useState, useMemo } from 'react';
import Layout from '../components/Layout';
import {
    ChartBarIcon,
    ArrowTrendingUpIcon,
    UserGroupIcon,
    ClockIcon,
    ArrowPathIcon,
    FlagIcon,
    CheckCircleIcon,
    TrophyIcon,
    CalendarIcon
} from '@heroicons/react/24/outline';
import { useCurrentUser } from '../contexts/CurrentUserContext';

type TimelineMetric = 'contacted' | 'interested' | 'registered';

function OutreachPerformanceLineChart({ timeline }: { timeline: { date: string; contacted: number; interested: number; registered: number }[] }) {
    const [selectedMetrics, setSelectedMetrics] = useState<TimelineMetric[]>(['contacted']);
    const chartWidth = 600;
    const chartHeight = 240;
    const padding = { top: 12, right: 12, bottom: 24, left: 40 };

    const toggleMetric = (m: TimelineMetric) => {
        setSelectedMetrics(prev =>
            prev.includes(m)
                ? (prev.length > 1 ? prev.filter(x => x !== m) : prev)
                : [...prev, m]
        );
    };

    const allValues = timeline.flatMap(p => selectedMetrics.map(m => p[m]));
    const maxValFromData = Math.max(...allValues, 1);

    // Round up the max value to a nice number for the scale
    const orderOfMagnitude = Math.floor(Math.log10(maxValFromData));
    const step = Math.pow(10, orderOfMagnitude);
    let topScale = Math.ceil(maxValFromData / step) * step;
    // If it's too close to the top, give it some breathing room
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

    const getPoints = (m: TimelineMetric) => {
        return timeline.map((p, i) => {
            const x = padding.left + (i / Math.max(timeline.length - 1, 1)) * innerWidth;
            const y = padding.top + innerHeight - ((p[m] - minVal) / range) * innerHeight;
            return `${x},${y}`;
        }).join(' ');
    };

    const metricColors: Record<TimelineMetric, string> = {
        contacted: '#3b82f6',
        interested: '#a855f7',
        registered: '#22c55e'
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 flex flex-col h-full">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Outreach Performance Over Time</h3>
                <div className="flex gap-2">
                    {(['contacted', 'interested', 'registered'] as TimelineMetric[]).map(m => {
                        const active = selectedMetrics.includes(m);
                        const color = metricColors[m];
                        return (
                            <button
                                key={m}
                                onClick={() => toggleMetric(m)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${active
                                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                                    }`}
                                style={active ? { backgroundColor: color, borderColor: color } : {}}
                            >
                                {m.charAt(0).toUpperCase() + m.slice(1)}
                            </button>
                        );
                    })}
                </div>
            </div>
            <div className="relative w-full flex-1 flex">
                {/* Y-Axis Scale Labels */}
                <div className="flex flex-col justify-between items-end pr-4 text-[10px] font-medium text-slate-400 pb-[24px]" style={{ height: `${chartHeight}px` }}>
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
                            {selectedMetrics.map(m => (
                                <linearGradient key={`grad-${m}`} id={`grad-${m}`} x1="0%" y1="0%" x2="0%" y2="100%">
                                    <stop offset="0%" stopColor={metricColors[m]} stopOpacity="0.2" />
                                    <stop offset="100%" stopColor={metricColors[m]} stopOpacity="0" />
                                </linearGradient>
                            ))}
                        </defs>
                        {timeline.length > 0 && selectedMetrics.map(m => (
                            <g key={`line-group-${m}`}>
                                <polyline
                                    fill="none"
                                    stroke={metricColors[m]}
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    points={getPoints(m)}
                                    className="transition-all duration-300"
                                />
                                {/* Only show fill if single metric to avoid mess, or low opacity */}
                                {selectedMetrics.length === 1 && (
                                    <polygon
                                        fill={`url(#grad-${m})`}
                                        points={`${padding.left},${padding.top + innerHeight} ${getPoints(m)} ${padding.left + innerWidth},${padding.top + innerHeight}`}
                                    />
                                )}
                            </g>
                        ))}
                    </svg>
                </div>
            </div>
            <div className="flex justify-between mt-auto pt-4 text-xs text-slate-400 font-medium">
                <span>{timeline[0]?.date}</span>
                <span className="opacity-60 italic">30 day cumulative trend</span>
                <span>{timeline[timeline.length - 1]?.date}</span>
            </div>
        </div>
    );
}

interface Company {
    id: string;
    companyName: string;
    contactStatus: string;
    relationshipStatus: string;
    isFlagged: boolean;
    lastUpdated?: string;
    pic?: string;
    discipline?: string;
    followUpsCompleted?: number;
    sponsorshipTier?: string;
    daysAttending?: string;
    remark?: string;
}

interface HistoryEntry {
    id: string;
    timestamp: string;
    user: string;
    companyId: string;
    action: string;
    remark?: string;
}

interface CommitteeMember {
    name: string;
    email: string;
    role: string;
}

export default function Analytics() {
    const { user: currentUser } = useCurrentUser();
    const [data, setData] = useState<Company[]>([]);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [dailyStats, setDailyStats] = useState<any[]>([]);
    const [committeeMembers, setCommitteeMembers] = useState<CommitteeMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedUserFilter, setSelectedUserFilter] = useState<string>('All');

    const fetchData = async (refresh = false) => {
        if (refresh) setRefreshing(true);
        try {
            const res = await fetch(`/api/data${refresh ? '?refresh=true' : ''}`);
            const responseData = await res.json();
            setData(responseData.companies || []);
            setHistory(responseData.history || []);
            setDailyStats(responseData.dailyStats || []);
            setCommitteeMembers(responseData.committeeMembers || []);
        } catch (err) {
            console.error('Failed to load data', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // --- Calculations ---

    const stats = useMemo(() => {
        console.log(">>> [DEBUG GRAPH] stats useMemo TRIGGERED", { dataLength: data.length, historyLength: history.length });
        if (data.length === 0) return null;

        const total = data.length;
        const reached = data.filter(c => c.contactStatus !== 'To Contact').length;
        const registered = data.filter(c => c.relationshipStatus === 'Registered').length;
        const interested = data.filter(c => c.relationshipStatus === 'Interested').length;
        const contacted = data.filter(c => c.contactStatus === 'Contacted').length;
        const noReply = data.filter(c => c.contactStatus === 'No Reply').length;
        const totalFollowUps = data.reduce((acc, c) => acc + (c.followUpsCompleted || 0), 0);

        // Distributions
        const sponsorshipDist: Record<string, number> = {};
        const disciplineDist: Record<string, number> = {};
        const dayDist: Record<string, number> = {};

        data.forEach(c => {
            // Sponsorship (Only for registered)
            if (c.relationshipStatus === 'Registered' && c.sponsorshipTier) {
                sponsorshipDist[c.sponsorshipTier] = (sponsorshipDist[c.sponsorshipTier] || 0) + 1;
            }

            // Discipline
            if (c.discipline) {
                c.discipline.split(',').forEach(d => {
                    const trimmed = d.trim();
                    if (trimmed) disciplineDist[trimmed] = (disciplineDist[trimmed] || 0) + 1;
                });
            }

            // Day Attendance
            if (c.daysAttending) {
                c.daysAttending.split(',').forEach(d => {
                    const trimmed = d.trim();
                    if (trimmed) dayDist[trimmed] = (dayDist[trimmed] || 0) + 1;
                });
            }
        });

        // Committee Leaderboard
        const memberStats = new Map<string, { registered: number; assigned: number; contacted: number }>();
        data.forEach(c => {
            const pic = c.pic || 'Unassigned';
            if (pic === 'Unassigned') return;

            if (!memberStats.has(pic)) {
                memberStats.set(pic, { registered: 0, assigned: 0, contacted: 0 });
            }
            const s = memberStats.get(pic)!;
            s.assigned++;
            if (c.relationshipStatus === 'Registered') s.registered++;
            if (c.contactStatus !== 'To Contact') s.contacted++;
        });

        const leaderboard = Array.from(memberStats.entries())
            .map(([name, s]) => ({
                name,
                registered: s.registered,
                contacted: s.contacted,
                assigned: s.assigned,
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

            // Find most recent stat for this date or earlier (fills gaps where no updates happened)
            const pastStats = dailyStats.filter(s => s.date <= dateStr).sort((a, b) => b.date.localeCompare(a.date));
            const stat = pastStats[0];

            if (stat) {
                // To keep the graph semantics unchanged matching Dashboard format (cumulative values)
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

        console.log('[DEBUG GRAPH] Final Cumulative Timeline fed from Daily_Stats:', cumulativeTimeline);

        // Active members (last activity per user from history)
        const memberActivityMap = new Map<string, string>();
        history.forEach((entry: HistoryEntry) => {
            if (entry.user && entry.timestamp) {
                const existingTime = memberActivityMap.get(entry.user);
                if (!existingTime || new Date(entry.timestamp) > new Date(existingTime)) {
                    memberActivityMap.set(entry.user, entry.timestamp);
                }
            }
        });
        const realMembers = Array.from(memberActivityMap.entries())
            .map(([name, lastActive]) => ({ name, lastActive }))
            .sort((a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime());

        return {
            total,
            reached,
            registered,
            interested,
            contacted,
            noReply,
            totalFollowUps,
            sponsorshipDist,
            disciplineDist,
            dayDist,
            leaderboard,
            timeline: cumulativeTimeline,
            flagged: data.filter(c => c.isFlagged),
            realMembers
        };
    }, [data, history]);

    const processedLogs = useMemo(() => {
        let logs = [...history].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        if (selectedUserFilter !== 'All') {
            logs = logs.filter(log => log.user === selectedUserFilter);
        }

        // Use string keys so lookup works whether companyId/id are string or number (e.g. from Sheets/JSON)
        const companyMap = new Map(data.map(c => [String(c.id), c.companyName]));

        return logs.map(log => {
            const id = log.companyId != null ? String(log.companyId) : '';
            const resolvedName = companyMap.get(id);
            return {
                ...log,
                companyName: resolvedName != null && resolvedName !== '' ? resolvedName : (id ? `Company (${id})` : '—')
            };
        });
    }, [history, data, selectedUserFilter]);

    if (loading) {
        return (
            <Layout title="Analytics | Outreach Tracker">
                <div className="flex flex-col items-center justify-center h-96">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mb-4"></div>
                    <p className="text-slate-600 font-medium">Loading analytics...</p>
                </div>
            </Layout>
        );
    }

    if (!stats) return null;

    return (
        <Layout title="Analytics | Outreach Tracker">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Outreach Dashboard</h1>
                    <p className="text-slate-500 mt-1">Real-time performance and pipeline metrics</p>
                </div>
                <button
                    onClick={() => fetchData(true)}
                    disabled={refreshing}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50"
                >
                    <ArrowPathIcon className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                    Refresh Data
                </button>
            </div>

            <div className="space-y-8">
                {/* Row 1: Key Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Outreach Progress Gauge */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex items-center gap-6">
                        <div className="relative w-24 h-24 flex-shrink-0">
                            <svg className="w-full h-full transform -rotate-90">
                                <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-100" />
                                <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent"
                                    strokeDasharray={2 * Math.PI * 40}
                                    strokeDashoffset={2 * Math.PI * 40 * (1 - (stats.reached / stats.total))}
                                    className="text-blue-600 transition-all duration-1000 ease-out"
                                />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center flex-col">
                                <span className="text-xl font-bold text-slate-900">{Math.round((stats.reached / stats.total) * 100)}%</span>
                            </div>
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Outreach Progress</h3>
                            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.reached} <span className="text-slate-400 font-normal text-lg">/ {stats.total}</span></p>
                            <p className="text-xs text-slate-400 mt-1">Companies reached</p>
                        </div>
                    </div>

                    {/* Total Follow-ups Card */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                        <div className="flex items-center justify-between mb-2">
                            <div className="p-2 bg-indigo-50 rounded-xl">
                                <ArrowTrendingUpIcon className="w-6 h-6 text-indigo-600" />
                            </div>
                            <span className="text-3xl font-bold text-slate-900">{stats.totalFollowUps}</span>
                        </div>
                        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Total Follow-ups</h3>
                        <p className="text-xs text-slate-400 mt-1">Interactions logged</p>
                    </div>

                    {/* Outreach Breakdown */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Outreach Breakdown</h3>
                        <div className="space-y-3">
                            {[
                                { label: 'Registered', count: stats.registered, color: 'bg-green-500', total: stats.total },
                                { label: 'Interested', count: stats.interested, color: 'bg-purple-500', total: stats.total },
                                { label: 'No Reply', count: stats.noReply, color: 'bg-slate-400', total: stats.total },
                            ].map(item => (
                                <div key={item.label} className="flex items-center gap-3">
                                    <span className="text-xs font-medium text-slate-600 w-20">{item.label}</span>
                                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div className={`${item.color} h-full rounded-full transition-all duration-1000`} style={{ width: `${(item.count / item.total) * 100}%` }} />
                                    </div>
                                    <span className="text-xs font-bold text-slate-900 w-8 text-right">{item.count}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Row 2: Distributions */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Sponsorship Distribution (Pie Mockup) */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-6">Sponsorship Tiers</h3>
                        <div className="space-y-4">
                            {Object.entries(stats.sponsorshipDist).length > 0 ? Object.entries(stats.sponsorshipDist).map(([tier, count]) => (
                                <div key={tier} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-3 h-3 rounded-full ${tier === 'Gold' ? 'bg-amber-400' : tier === 'Silver' ? 'bg-slate-300' : tier === 'Bronze' ? 'bg-orange-400' : 'bg-blue-400'}`} />
                                        <span className="text-sm font-medium text-slate-700">{tier}</span>
                                    </div>
                                    <span className="text-sm font-bold text-slate-900">{count}</span>
                                </div>
                            )) : <p className="text-sm text-slate-400 text-center py-10 italic">No registrations yet</p>}
                        </div>
                    </div>

                    {/* Discipline Distribution */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-6">Disciplines</h3>
                        <div className="space-y-4 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                            {Object.entries(stats.disciplineDist).sort((a, b) => b[1] - a[1]).map(([disc, count]) => (
                                <div key={disc}>
                                    <div className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                                        <span>{disc}</span>
                                        <span>{count}</span>
                                    </div>
                                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                        <div className="bg-blue-500 h-full rounded-full" style={{ width: `${(count / stats.total) * 100}%` }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Day Attendance */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-6 flex items-center gap-2">
                            <CalendarIcon className="w-4 h-4" />
                            Day Attendance
                        </h3>
                        <div className="flex items-end justify-between gap-4 h-48 px-2">
                            {[1, 2, 3, 4, 5].map(day => {
                                const count = stats.dayDist[day.toString()] || 0;
                                const maxHeight = Math.max(...Object.values(stats.dayDist), 1);
                                return (
                                    <div key={day} className="flex-1 flex flex-col items-center gap-2">
                                        <div className="w-full bg-slate-100 rounded-t-lg relative flex items-end overflow-hidden" style={{ height: '140px' }}>
                                            <div className="w-full bg-gradient-to-t from-blue-600 to-indigo-500 transition-all duration-1000" style={{ height: `${(count / maxHeight) * 100}%` }} />
                                            {count > 0 && <span className="absolute -top-6 left-0 right-0 text-center text-xs font-bold text-slate-900">{count}</span>}
                                        </div>
                                        <span className="text-xs font-bold text-slate-500">Day {day}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Row 3: Timeline Graph */}
                <OutreachPerformanceLineChart timeline={stats.timeline} />

                {/* Team & Admin Section: Active Members, Leaderboard, Flagged */}
                {currentUser?.isCommitteeMember && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-4">
                        {/* Committee Leaderboard (Top Performers) */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                    <TrophyIcon className="w-5 h-5 text-amber-500" />
                                    Committee Leaderboard
                                </h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-50 text-slate-500 font-medium text-xs">
                                        <tr>
                                            <th className="px-6 py-4">Name</th>
                                            <th className="px-6 py-4 text-center">Registered</th>
                                            <th className="px-6 py-4 text-right">Completion %</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {stats.leaderboard.map((m, i) => (
                                            <tr key={m.name} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <span className="w-6 text-xs text-slate-400 font-bold">{i + 1}.</span>
                                                        <span className="font-semibold text-slate-900">{m.name}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className="inline-flex px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-bold text-xs">
                                                        {m.registered}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <span className="text-slate-600 font-medium">{m.percentage}%</span>
                                                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                            <div className="bg-blue-500 h-full" style={{ width: `${m.percentage}%` }} />
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Active Members */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="p-6 border-b border-slate-100">
                                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                    <UserGroupIcon className="w-5 h-5" />
                                    Active Members
                                </h3>
                            </div>
                            <div className="p-4 space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
                                {stats.realMembers.length > 0 ? stats.realMembers.map(member => {
                                    const lastActive = new Date(member.lastActive);
                                    const now = new Date();
                                    const diffMins = Math.floor((now.getTime() - lastActive.getTime()) / (1000 * 60));
                                    const timeStr = diffMins < 60 ? `${diffMins}m ago` : diffMins < 1440 ? `${Math.floor(diffMins / 60)}h ago` : `${Math.floor(diffMins / 1440)}d ago`;
                                    return (
                                        <div key={member.name} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-600 border border-slate-200">
                                                    {member.name.charAt(0)}
                                                </div>
                                                <span className="text-sm font-medium text-slate-800">{member.name}</span>
                                            </div>
                                            <span className="text-xs text-slate-500 tabular-nums">{timeStr}</span>
                                        </div>
                                    );
                                }) : (
                                    <p className="text-sm text-slate-400 py-6 text-center">No activity yet</p>
                                )}
                            </div>
                        </div>

                        {/* Flagged Companies */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col">
                            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2 text-red-600">
                                    <FlagIcon className="w-5 h-5" />
                                    Flagged Companies
                                </h3>
                                <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full">{stats.flagged.length} Pending</span>
                            </div>
                            <div className="flex-1 overflow-y-auto max-h-96 p-4 space-y-3 custom-scrollbar">
                                {stats.flagged.length > 0 ? stats.flagged.map(c => (
                                    <div key={c.id} className="p-4 bg-red-50/50 border border-red-100 rounded-xl hover:border-red-200 transition-all">
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-bold text-slate-900">{c.companyName}</h4>
                                            <span className="text-[10px] font-mono text-slate-400 uppercase">{c.pic || 'Unassigned'}</span>
                                        </div>
                                        <p className="text-sm text-slate-600 italic leading-relaxed">
                                            "{c.remark || 'No specific remark provided'}"
                                        </p>
                                    </div>
                                )) : (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400 py-10">
                                        <CheckCircleIcon className="w-12 h-12 text-slate-200 mb-2" />
                                        <p className="text-sm font-medium">All clear! No flagged items.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Admin-Only: Full Logs View (Admin + Superadmin) */}
                {currentUser?.isAdmin && (
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                <ClockIcon className="w-5 h-5 text-blue-500" />
                                Recent Activity Logs
                            </h3>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-slate-600">Filter by User:</span>
                                <select
                                    className="text-sm border-slate-200 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 py-1.5 pl-3 pr-8"
                                    value={selectedUserFilter}
                                    onChange={(e) => setSelectedUserFilter(e.target.value)}
                                >
                                    <option value="All">All Members</option>
                                    {stats.realMembers.map(m => (
                                        <option key={m.name} value={m.name}>{m.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="overflow-x-auto max-h-96 overflow-y-auto custom-scrollbar">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-slate-50 text-slate-500 font-medium text-xs sticky top-0 z-10">
                                    <tr>
                                        <th className="px-6 py-4">Date & Time</th>
                                        <th className="px-6 py-4">Member Name</th>
                                        <th className="px-6 py-4">Company Name</th>
                                        <th className="px-6 py-4 w-full">Action / Remark</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {processedLogs.length > 0 ? processedLogs.map(log => {
                                        const date = new Date(log.timestamp);
                                        const dateStr = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                                        const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                                        return (
                                            <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-6 py-4 text-slate-600">
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold text-slate-900">{dateStr}</span>
                                                        <span className="text-xs text-slate-400">{timeStr}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center text-[10px] font-bold text-blue-600">
                                                            {log.user.charAt(0)}
                                                        </div>
                                                        <span className="font-medium text-slate-800">{log.user}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 font-medium text-slate-700">{log.companyName}</td>
                                                <td className="px-6 py-4 text-slate-600 whitespace-normal min-w-[300px]">
                                                    {log.remark || log.action}
                                                </td>
                                            </tr>
                                        );
                                    }) : (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-8 text-center text-slate-400 text-sm italic">
                                                No logs found
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #e2e8f0;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #cbd5e1;
                }
            `}</style>
        </Layout>
    );
}
