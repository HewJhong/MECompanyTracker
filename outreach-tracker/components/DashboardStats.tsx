import React from 'react';
import {
    ChartBarIcon,
    ChatBubbleBottomCenterTextIcon,
    ClockIcon,
    FlagIcon
} from '@heroicons/react/24/outline';

interface StatsProps {
    totalCompanies: number;
    contactedCount: number;
    responseCount: number;
    stalledCount: number;
    flaggedCount: number;
}

export default function DashboardStats({
    totalCompanies,
    contactedCount,
    responseCount,
    stalledCount,
    flaggedCount
}: StatsProps) {

    const progressPercentage = totalCompanies > 0
        ? Math.round((contactedCount / totalCompanies) * 100)
        : 0;

    const responseRate = contactedCount > 0
        ? Math.round((responseCount / contactedCount) * 100)
        : 0;

    const stats = [
        {
            id: 1,
            title: 'Outreach Progress',
            value: `${progressPercentage}%`,
            subtitle: 'Contacted',
            detail: `${contactedCount} of ${totalCompanies} companies`,
            icon: ChartBarIcon,
            iconBg: 'bg-blue-100',
            iconColor: 'text-blue-600',
            progressValue: progressPercentage,
            progressColor: 'bg-blue-600',
            barBg: 'bg-blue-50'
        },
        {
            id: 2,
            title: 'Response Rate',
            value: `${responseRate}%`,
            subtitle: 'Replied',
            detail: `${responseCount} positive responses`,
            icon: ChatBubbleBottomCenterTextIcon,
            iconBg: 'bg-green-100',
            iconColor: 'text-green-600',
            progressValue: Math.min(responseRate, 100),
            progressColor: responseRate > 50 ? 'bg-green-500' : 'bg-yellow-500',
            barBg: responseRate > 50 ? 'bg-green-50' : 'bg-yellow-50'
        },
        {
            id: 3,
            title: 'Stalled',
            value: stalledCount.toString(),
            subtitle: 'Over 7 Days',
            detail: stalledCount > 0 ? 'Needs attention' : 'All on track',
            icon: ClockIcon,
            iconBg: 'bg-amber-100',
            iconColor: 'text-amber-600',
            badge: stalledCount > 0 ? { text: 'Action Required', color: 'bg-amber-100 text-amber-700' } : null
        },
        {
            id: 4,
            title: 'Flagged Items',
            value: flaggedCount.toString(),
            subtitle: 'Attention Requests',
            detail: flaggedCount > 0 ? 'View details below' : 'No issues',
            icon: FlagIcon,
            iconBg: 'bg-red-100',
            iconColor: 'text-red-600',
            badge: flaggedCount > 0 
                ? { text: `${flaggedCount} Pending`, color: 'bg-red-100 text-red-700' }
                : { text: 'All Clear', color: 'bg-slate-100 text-slate-600' }
        }
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {stats.map((stat) => (
                <div
                    key={stat.id}
                    className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow duration-200"
                >
                    {/* Header with Icon */}
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                            <h3 className="text-slate-600 text-sm font-medium uppercase tracking-wide">
                                {stat.title}
                            </h3>
                        </div>
                        <div className={`${stat.iconBg} p-2 rounded-lg`}>
                            <stat.icon className={`w-5 h-5 ${stat.iconColor}`} aria-hidden="true" />
                        </div>
                    </div>

                    {/* Value */}
                    <div className="mb-3">
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-bold text-slate-900">{stat.value}</span>
                            <span className="text-sm text-slate-500">{stat.subtitle}</span>
                        </div>
                    </div>

                    {/* Progress Bar (for first two cards) */}
                    {stat.progressValue !== undefined && (
                        <div className="mb-3">
                            <div className={`w-full ${stat.barBg} rounded-full h-2 overflow-hidden`}>
                                <div
                                    className={`${stat.progressColor} h-2 rounded-full transition-all duration-500 ease-out`}
                                    style={{ width: `${stat.progressValue}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Badge or Detail */}
                    {stat.badge ? (
                        <div className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${stat.badge.color}`}>
                            {stat.badge.text}
                        </div>
                    ) : (
                        <p className="text-xs text-slate-500">{stat.detail}</p>
                    )}
                </div>
            ))}
        </div>
    );
}
