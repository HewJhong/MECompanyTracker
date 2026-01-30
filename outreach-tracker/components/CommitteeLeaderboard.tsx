import React from 'react';
import { TrophyIcon } from '@heroicons/react/24/solid';
import { UserGroupIcon } from '@heroicons/react/24/outline';

interface CommitteeMember {
    name: string;
    contactedCount: number;
    totalAssigned: number;
    responseCount: number;
}

interface CommitteeLeaderboardProps {
    members: CommitteeMember[];
}

export default function CommitteeLeaderboard({ members }: CommitteeLeaderboardProps) {
    // Sort members by completion percentage
    const sortedMembers = [...members].sort((a, b) => {
        const aProgress = a.totalAssigned > 0 ? (a.contactedCount / a.totalAssigned) * 100 : 0;
        const bProgress = b.totalAssigned > 0 ? (b.contactedCount / b.totalAssigned) * 100 : 0;
        return bProgress - aProgress;
    });

    // Find max progress for scaling
    const maxProgress = Math.max(...sortedMembers.map(m => 
        m.totalAssigned > 0 ? (m.contactedCount / m.totalAssigned) * 100 : 0
    ), 1);

    const getProgressColor = (progress: number) => {
        if (progress >= 75) return 'bg-green-500';
        if (progress >= 50) return 'bg-blue-500';
        if (progress >= 25) return 'bg-amber-500';
        return 'bg-slate-400';
    };

    const getRankBadge = (index: number) => {
        if (index === 0) return { icon: '🥇', color: 'text-yellow-600', bg: 'bg-yellow-50' };
        if (index === 1) return { icon: '🥈', color: 'text-slate-400', bg: 'bg-slate-50' };
        if (index === 2) return { icon: '🥉', color: 'text-orange-600', bg: 'bg-orange-50' };
        return null;
    };

    if (members.length === 0) {
        return (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
                <div className="text-center">
                    <UserGroupIcon className="mx-auto w-12 h-12 text-slate-300" />
                    <h3 className="mt-3 text-sm font-medium text-slate-900">No Data Yet</h3>
                    <p className="mt-1 text-sm text-slate-500">Committee progress will appear here</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-100 p-2 rounded-lg">
                        <TrophyIcon className="w-5 h-5 text-blue-600" aria-hidden="true" />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-semibold text-slate-900">Committee Leaderboard</h3>
                        <p className="text-xs text-slate-600 mt-0.5">Progress by team member</p>
                    </div>
                </div>
            </div>

            {/* Chart */}
            <div className="p-6 space-y-4">
                {sortedMembers.map((member, index) => {
                    const progress = member.totalAssigned > 0 
                        ? Math.round((member.contactedCount / member.totalAssigned) * 100) 
                        : 0;
                    const responseRate = member.contactedCount > 0
                        ? Math.round((member.responseCount / member.contactedCount) * 100)
                        : 0;
                    const rankBadge = getRankBadge(index);

                    return (
                        <div key={member.name} className="group">
                            {/* Member Info */}
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                    {rankBadge && (
                                        <span className={`text-lg flex-shrink-0`} role="img" aria-label={`Rank ${index + 1}`}>
                                            {rankBadge.icon}
                                        </span>
                                    )}
                                    {!rankBadge && (
                                        <span className="text-sm font-medium text-slate-400 w-6 flex-shrink-0">
                                            #{index + 1}
                                        </span>
                                    )}
                                    <span className="text-sm font-medium text-slate-900 truncate">
                                        {member.name}
                                    </span>
                                </div>
                                <div className="flex items-baseline gap-2 flex-shrink-0">
                                    <span className="text-lg font-bold text-slate-900">{progress}%</span>
                                    <span className="text-xs text-slate-500">
                                        ({member.contactedCount}/{member.totalAssigned})
                                    </span>
                                </div>
                            </div>

                            {/* Progress Bar */}
                            <div className="relative">
                                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                                    <div
                                        className={`${getProgressColor(progress)} h-3 rounded-full transition-all duration-700 ease-out group-hover:opacity-90`}
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                            </div>

                            {/* Stats */}
                            <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                                <span>Response Rate: <span className="font-medium text-slate-700">{responseRate}%</span></span>
                                <span>•</span>
                                <span>{member.responseCount} positive responses</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Footer Stats */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200">
                <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                        <p className="text-xs text-slate-600">Total Members</p>
                        <p className="text-lg font-bold text-slate-900">{members.length}</p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-600">Companies</p>
                        <p className="text-lg font-bold text-slate-900">
                            {members.reduce((sum, m) => sum + m.totalAssigned, 0)}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-600">Responses</p>
                        <p className="text-lg font-bold text-slate-900">
                            {members.reduce((sum, m) => sum + m.responseCount, 0)}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
