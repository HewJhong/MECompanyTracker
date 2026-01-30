import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { 
    ChartBarIcon, 
    ArrowTrendingUpIcon,
    UserGroupIcon,
    ClockIcon
} from '@heroicons/react/24/solid';

interface Company {
    id: string;
    companyName: string;
    status: string;
    isFlagged: boolean;
    lastUpdated?: string;
    pic?: string;
    discipline?: string;
}

interface HistoryEntry {
    timestamp: string;
    user: string;
    companyName: string;
}

export default function Analytics() {
    const [data, setData] = useState<Company[]>([]);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/data')
            .then((res) => res.json())
            .then((responseData) => {
                setData(responseData.companies || []);
                setHistory(responseData.history || []);
                setLoading(false);
            })
            .catch((err) => {
                console.error('Failed to load data', err);
                setLoading(false);
            });
    }, []);

    // Calculate analytics metrics
    const statusDistribution = {
        'To Contact': data.filter(c => c.status === 'To Contact').length,
        'Contacted': data.filter(c => c.status === 'Contacted').length,
        'Replied': data.filter(c => c.status === 'Replied').length,
        'Negotiating': data.filter(c => c.status === 'Negotiating').length,
        'Closed': data.filter(c => c.status === 'Closed').length,
        'Rejected': data.filter(c => c.status === 'Rejected').length,
        'Succeeded': data.filter(c => c.status === 'Succeeded').length,
    };

    const totalCompanies = data.length;
    const contactedCount = data.filter(c => c.status && c.status !== 'To Contact').length;
    const responseRate = contactedCount > 0 
        ? Math.round((data.filter(c => ['Replied', 'Negotiating', 'Closed', 'Succeeded'].includes(c.status)).length / contactedCount) * 100)
        : 0;
    const successRate = totalCompanies > 0
        ? Math.round((data.filter(c => c.status === 'Succeeded').length / totalCompanies) * 100)
        : 0;

    // Activity by discipline
    const disciplineStats = new Map<string, number>();
    data.forEach(company => {
        const discipline = company.discipline || 'Unknown';
        disciplineStats.set(discipline, (disciplineStats.get(discipline) || 0) + 1);
    });

    // Activity over time (last 7 days)
    const last7Days = Array.from({ length: 7 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - i));
        return date.toISOString().split('T')[0];
    });

    const activityByDay = last7Days.map(day => {
        const count = history.filter(h => {
            const historyDate = new Date(h.timestamp).toISOString().split('T')[0];
            return historyDate === day;
        }).length;
        return { date: day, count };
    });

    const maxActivity = Math.max(...activityByDay.map(d => d.count), 1);

    // Top performers
    const memberPerformance = new Map<string, { total: number; contacted: number; responses: number }>();
    data.forEach(company => {
        const pic = company.pic || 'Unassigned';
        if (pic === 'Unassigned') return;
        
        if (!memberPerformance.has(pic)) {
            memberPerformance.set(pic, { total: 0, contacted: 0, responses: 0 });
        }
        const stats = memberPerformance.get(pic)!;
        stats.total++;
        
        if (company.status && company.status !== 'To Contact') {
            stats.contacted++;
        }
        if (['Replied', 'Negotiating', 'Closed', 'Succeeded'].includes(company.status)) {
            stats.responses++;
        }
    });

    const topPerformers = Array.from(memberPerformance.entries())
        .map(([name, stats]) => ({
            name,
            score: stats.contacted + (stats.responses * 2)
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

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

    return (
        <Layout title="Analytics | Outreach Tracker">
            {/* Page Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl">
                        <ChartBarIcon className="w-6 h-6 text-white" aria-hidden="true" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">Analytics Dashboard</h1>
                        <p className="text-slate-600 mt-1">Performance insights and outreach metrics</p>
                    </div>
                </div>
            </div>

            <div className="space-y-8">
                {/* Key Metrics Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="p-2 bg-blue-100 rounded-lg">
                                <UserGroupIcon className="w-5 h-5 text-blue-600" />
                            </div>
                            <span className="text-2xl font-bold text-slate-900">{totalCompanies}</span>
                        </div>
                        <h3 className="text-sm font-medium text-slate-600">Total Companies</h3>
                        <p className="text-xs text-slate-500 mt-1">In database</p>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="p-2 bg-green-100 rounded-lg">
                                <ArrowTrendingUpIcon className="w-5 h-5 text-green-600" />
                            </div>
                            <span className="text-2xl font-bold text-slate-900">{contactedCount}</span>
                        </div>
                        <h3 className="text-sm font-medium text-slate-600">Contacted</h3>
                        <p className="text-xs text-slate-500 mt-1">Companies reached out to</p>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="p-2 bg-purple-100 rounded-lg">
                                <ChartBarIcon className="w-5 h-5 text-purple-600" />
                            </div>
                            <span className="text-2xl font-bold text-slate-900">{responseRate}%</span>
                        </div>
                        <h3 className="text-sm font-medium text-slate-600">Response Rate</h3>
                        <p className="text-xs text-slate-500 mt-1">Positive responses</p>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="p-2 bg-amber-100 rounded-lg">
                                <ClockIcon className="w-5 h-5 text-amber-600" />
                            </div>
                            <span className="text-2xl font-bold text-slate-900">{successRate}%</span>
                        </div>
                        <h3 className="text-sm font-medium text-slate-600">Success Rate</h3>
                        <p className="text-xs text-slate-500 mt-1">Successfully closed</p>
                    </div>
                </div>

                {/* Charts Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Status Distribution */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                        <h3 className="text-lg font-semibold text-slate-900 mb-6">Status Distribution</h3>
                        <div className="space-y-4">
                            {Object.entries(statusDistribution).map(([status, count]) => {
                                const percentage = totalCompanies > 0 ? (count / totalCompanies) * 100 : 0;
                                const colors: Record<string, string> = {
                                    'To Contact': 'bg-slate-500',
                                    'Contacted': 'bg-blue-500',
                                    'Replied': 'bg-green-500',
                                    'Negotiating': 'bg-amber-500',
                                    'Closed': 'bg-purple-500',
                                    'Rejected': 'bg-red-500',
                                    'Succeeded': 'bg-emerald-500',
                                };
                                return (
                                    <div key={status}>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-medium text-slate-700">{status}</span>
                                            <span className="text-sm text-slate-600">{count} ({Math.round(percentage)}%)</span>
                                        </div>
                                        <div className="w-full bg-slate-100 rounded-full h-3">
                                            <div
                                                className={`${colors[status]} h-3 rounded-full transition-all duration-700`}
                                                style={{ width: `${percentage}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Activity Timeline */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                        <h3 className="text-lg font-semibold text-slate-900 mb-6">Activity Last 7 Days</h3>
                        <div className="flex items-end justify-between gap-2 h-48">
                            {activityByDay.map((day, index) => {
                                const height = (day.count / maxActivity) * 100;
                                return (
                                    <div key={index} className="flex-1 flex flex-col items-center gap-2">
                                        <div className="w-full flex items-end justify-center h-40">
                                            <div
                                                className="w-full bg-gradient-to-t from-blue-500 to-indigo-500 rounded-t-lg transition-all hover:from-blue-600 hover:to-indigo-600 cursor-pointer relative group"
                                                style={{ height: `${height}%`, minHeight: day.count > 0 ? '8px' : '0' }}
                                                title={`${day.count} activities`}
                                            >
                                                <span className="absolute -top-6 left-1/2 transform -translate-x-1/2 text-xs font-medium text-slate-900 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {day.count}
                                                </span>
                                            </div>
                                        </div>
                                        <span className="text-xs text-slate-500">
                                            {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Bottom Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Top Performers */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                        <h3 className="text-lg font-semibold text-slate-900 mb-6">Top Performers</h3>
                        <div className="space-y-4">
                            {topPerformers.length > 0 ? topPerformers.map((performer, index) => {
                                const badges = ['🥇', '🥈', '🥉'];
                                return (
                                    <div key={performer.name} className="flex items-center gap-4">
                                        <span className="text-2xl flex-shrink-0 w-10 text-center">
                                            {badges[index] || `#${index + 1}`}
                                        </span>
                                        <div className="flex-1">
                                            <p className="font-medium text-slate-900">{performer.name}</p>
                                            <p className="text-xs text-slate-500">Performance Score: {performer.score}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-lg font-bold text-slate-900">{performer.score}</p>
                                            <p className="text-xs text-slate-500">points</p>
                                        </div>
                                    </div>
                                );
                            }) : (
                                <p className="text-sm text-slate-500 text-center py-8">No performance data yet</p>
                            )}
                        </div>
                    </div>

                    {/* By Discipline */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                        <h3 className="text-lg font-semibold text-slate-900 mb-6">Companies by Discipline</h3>
                        <div className="space-y-3">
                            {Array.from(disciplineStats.entries()).map(([discipline, count]) => {
                                const percentage = totalCompanies > 0 ? (count / totalCompanies) * 100 : 0;
                                return (
                                    <div key={discipline} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                                        <div className="flex-1">
                                            <p className="font-medium text-slate-900">{discipline}</p>
                                            <div className="mt-2 w-full bg-slate-200 rounded-full h-2">
                                                <div
                                                    className="bg-gradient-to-r from-blue-500 to-indigo-500 h-2 rounded-full transition-all"
                                                    style={{ width: `${percentage}%` }}
                                                />
                                            </div>
                                        </div>
                                        <div className="ml-4 text-right">
                                            <p className="text-lg font-bold text-slate-900">{count}</p>
                                            <p className="text-xs text-slate-500">{Math.round(percentage)}%</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
}
