import React from 'react';
import { 
    CheckCircleIcon, 
    ClockIcon, 
    ExclamationCircleIcon 
} from '@heroicons/react/24/solid';
import { UserCircleIcon } from '@heroicons/react/24/outline';

interface MemberActivityProps {
    members: {
        name: string;
        lastActive: string; // ISO Date string
    }[];
}

export default function MemberActivity({ members }: MemberActivityProps) {
    const getStatus = (lastActive: string) => {
        if (!lastActive) return { 
            label: 'Never Active', 
            color: 'bg-slate-100 text-slate-600',
            icon: ExclamationCircleIcon,
            iconColor: 'text-slate-500'
        };

        const date = new Date(lastActive);
        const now = new Date();
        const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

        if (diffHours < 24) return { 
            label: 'Active Today', 
            color: 'bg-green-100 text-green-700',
            icon: CheckCircleIcon,
            iconColor: 'text-green-600'
        };
        if (diffHours < 72) return { 
            label: 'Active Recently', 
            color: 'bg-blue-100 text-blue-700',
            icon: ClockIcon,
            iconColor: 'text-blue-600'
        };

        return { 
            label: 'Inactive (>3d)', 
            color: 'bg-red-100 text-red-700',
            icon: ExclamationCircleIcon,
            iconColor: 'text-red-600'
        };
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        const now = new Date();
        const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
        
        if (diffHours < 1) return 'Just now';
        if (diffHours < 24) {
            const hours = Math.floor(diffHours);
            return `${hours}h ago`;
        }
        
        return date.toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    // Sort members by activity (most recent first)
    const sortedMembers = [...members].sort((a, b) => {
        if (!a.lastActive) return 1;
        if (!b.lastActive) return -1;
        return new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime();
    });

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-slate-100">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-slate-200 p-2 rounded-lg">
                            <UserCircleIcon className="w-5 h-5 text-slate-600" aria-hidden="true" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-slate-900">Member Activity</h3>
                            <p className="text-xs text-slate-600 mt-0.5">Real-time status monitor</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                        <span className="text-xs text-slate-500 ml-1">Live</span>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                {members.length === 0 ? (
                    <div className="px-6 py-12 text-center">
                        <UserCircleIcon className="mx-auto w-12 h-12 text-slate-300 mb-3" />
                        <p className="text-sm text-slate-500">No activity recorded yet</p>
                        <p className="text-xs text-slate-400 mt-1">Member activity will appear here once tracked</p>
                    </div>
                ) : (
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-3 font-medium text-xs uppercase tracking-wide">Member</th>
                                <th className="px-6 py-3 font-medium text-xs uppercase tracking-wide">Last Active</th>
                                <th className="px-6 py-3 font-medium text-xs uppercase tracking-wide">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {sortedMembers.map((member, index) => {
                                const status = getStatus(member.lastActive);
                                const StatusIcon = status.icon;
                                
                                return (
                                    <tr 
                                        key={index} 
                                        className="hover:bg-slate-50 transition-colors group"
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                                                    {member.name.charAt(0).toUpperCase()}
                                                </div>
                                                <span className="font-medium text-slate-900">{member.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-slate-600">
                                            {formatDate(member.lastActive)}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <StatusIcon className={`w-4 h-4 ${status.iconColor} flex-shrink-0`} aria-hidden="true" />
                                                <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${status.color}`}>
                                                    {status.label}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Footer with summary */}
            {members.length > 0 && (
                <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
                    <span className="text-slate-600">
                        {members.filter(m => {
                            const diffHours = m.lastActive ? (new Date().getTime() - new Date(m.lastActive).getTime()) / (1000 * 60 * 60) : Infinity;
                            return diffHours < 24;
                        }).length} active today
                    </span>
                    <span className="text-slate-500">Total: {members.length} members</span>
                </div>
            )}
        </div>
    );
}

