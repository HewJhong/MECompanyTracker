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

interface Company {
    id: string;
    companyName: string;
    status: string;
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
    const [committeeMembers, setCommitteeMembers] = useState<CommitteeMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchData = async (refresh = false) => {
        if (refresh) setRefreshing(true);
        try {
            const res = await fetch(`/api/data${refresh ? '?refresh=true' : ''}`);
            const responseData = await res.json();
            setData(responseData.companies || []);
            setHistory(responseData.history || []);
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
        if (data.length === 0) return null;

        const total = data.length;
        const reached = data.filter(c => !['To Contact', 'Rejected'].includes(c.status)).length;
        const registered = data.filter(c => c.status === 'Registered').length;
        const interested = data.filter(c => c.status === 'Interested').length;
        const contacted = data.filter(c => c.status === 'Contacted').length;
        const noReply = data.filter(c => c.status === 'No Reply').length;
        const totalFollowUps = data.reduce((acc, c) => acc + (c.followUpsCompleted || 0), 0);

        // Distributions
        const sponsorshipDist: Record<string, number> = {};
        const disciplineDist: Record<string, number> = {};
        const dayDist: Record<string, number> = {};

        data.forEach(c => {
            // Sponsorship (Only for registered)
            if (c.status === 'Registered' && c.sponsorshipTier) {
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
            if (c.status === 'Registered') s.registered++;
            if (!['To Contact'].includes(c.status)) s.contacted++;
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

        // Timeline Data (Last 30 days)
        // Group history by date and type
        const timeline: Record<string, { contacted: number; interested: number; registered: number }> = {};
        const daysToShow = 30;
        const now = new Date();
        for (let i = daysToShow; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            timeline[d.toISOString().split('T')[0]] = { contacted: 0, interested: 0, registered: 0 };
        }

        // We estimate transitions from history logs
        // This is a bit complex without explicit state machine logs, so we'll look for keywords
        history.forEach(h => {
            const date = h.timestamp.split('T')[0];
            if (!timeline[date]) return;

            const r = (h.remark || h.action).toLowerCase();
            if (r.includes('status: contacted') || r.includes('outreach')) timeline[date].contacted++;
            if (r.includes('status: interested') || r.includes('company reply')) timeline[date].interested++;
            if (r.includes('status: registered') || r.includes('completed')) timeline[date].registered++;
        });

        // Convert to cumulative
        const timelineList = Object.entries(timeline).sort((a, b) => a[0].localeCompare(b[0]));
        let cumContacted = 0, cumInterested = 0, cumRegistered = 0;
        const cumulativeTimeline = timelineList.map(([date, counts]) => {
            cumContacted += counts.contacted;
            cumInterested += counts.interested;
            cumRegistered += counts.registered;
            return { date, contacted: cumContacted, interested: cumInterested, registered: cumRegistered };
        });

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
            flagged: data.filter(c => c.isFlagged)
        };
    }, [data, history]);

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
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-8">Outreach Performance Over Time</h3>
                    <div className="h-64 relative">
                        {/* Simplified Legend */}
                        <div className="absolute top-0 right-0 flex gap-4 text-xs font-medium">
                            <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-blue-500" /> Contacted</div>
                            <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-purple-500" /> Interested</div>
                            <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-green-500" /> Registered</div>
                        </div>

                        {/* Chart Area */}
                        <div className="absolute inset-0 flex items-end justify-between pt-8">
                            {stats.timeline.map((point, i) => {
                                const max = Math.max(...stats.timeline.map(p => p.contacted), 1);
                                return (
                                    <div key={point.date} className="group relative flex-1 h-full flex flex-col justify-end gap-1 px-0.5">
                                        <div className="w-full bg-slate-100 h-full absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity" />

                                        {/* Registered Line Segment */}
                                        <div className="w-full bg-green-500 z-30 transition-all" style={{ height: `${(point.registered / max) * 100}%` }} />
                                        {/* Interested Line Segment */}
                                        <div className="w-full bg-purple-500 z-20 transition-all" style={{ height: `${(point.interested / max) * 100}%` }} />
                                        {/* Contacted Line Segment */}
                                        <div className="w-full bg-blue-500 z-10 transition-all" style={{ height: `${(point.contacted / max) * 100}%` }} />

                                        {/* Tooltip on hover */}
                                        <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-slate-900 text-white p-2 rounded text-[10px] hidden group-hover:block z-50 whitespace-nowrap shadow-xl">
                                            <p className="font-bold border-b border-slate-700 pb-1 mb-1">{point.date}</p>
                                            <p>Contacted: {point.contacted}</p>
                                            <p>Interested: {point.interested}</p>
                                            <p>Registered: {point.registered}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <div className="flex justify-between mt-4 text-[10px] text-slate-400 font-medium">
                        <span>{stats.timeline[0]?.date}</span>
                        <span>Outreach Activity Trend (Last 30 Days)</span>
                        <span>{stats.timeline[stats.timeline.length - 1]?.date}</span>
                    </div>
                </div>

                {/* Secure / Admin Section */}
                {currentUser?.isCommitteeMember && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-4">
                        {/* Leaderboard */}
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
