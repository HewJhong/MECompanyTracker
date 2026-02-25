import React, { useState } from 'react';
import {
    MagnifyingGlassIcon,
    FunnelIcon,
    ClockIcon,
    FlagIcon
} from '@heroicons/react/24/outline';

interface Company {
    id: string;
    name: string;
    status: string;
    contact: string;
    email: string;
    lastUpdated: string;
    isFlagged: boolean;
    isStale: boolean;
    replyNeeded?: boolean;
}

interface CommitteeWorkspaceProps {
    companies: Company[];
    memberName: string;
    onCompanyClick?: (companyId: string) => void;
}

const statusColumns = [
    { id: 'To Contact', label: 'To Contact', color: 'bg-slate-100 border-slate-300' },
    { id: 'Contacted', label: 'Contacted', color: 'bg-blue-50 border-blue-300' },
    { id: 'Negotiating', label: 'Negotiating', color: 'bg-amber-50 border-amber-300' },
    { id: 'Interested', label: 'Interested', color: 'bg-purple-50 border-purple-300' },
    { id: 'Completed', label: 'Completed', color: 'bg-green-50 border-green-300' },
];

export default function CommitteeWorkspace({
    companies,
    memberName,
    onCompanyClick
}: CommitteeWorkspaceProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [showOnlyStale, setShowOnlyStale] = useState(false);
    const [showReplyNeeded, setShowReplyNeeded] = useState(false);

    // Filter companies
    const filteredCompanies = companies.filter(company => {
        const matchesSearch = company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            company.contact.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStale = !showOnlyStale || company.isStale;
        const matchesReplyNeeded = !showReplyNeeded || company.replyNeeded;

        return matchesSearch && matchesStale && matchesReplyNeeded;
    });

    // Group by status
    const groupedCompanies = statusColumns.map(column => ({
        ...column,
        companies: filteredCompanies.filter(c => c.status === column.id)
    }));

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays}d ago`;

        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const staleCount = companies.filter(c => c.isStale).length;
    const replyNeededCount = companies.filter(c => c.replyNeeded).length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900">My Assignments</h2>
                        <p className="text-sm text-slate-600 mt-1">
                            {companies.length} companies assigned to {memberName}
                        </p>
                    </div>

                    {/* Filters */}
                    <div className="flex items-center gap-3">
                        {/* Search */}
                        <div className="relative">
                            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
                            <input
                                type="text"
                                placeholder="Search companies..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-64"
                            />
                        </div>

                        {/* Reply Needed Filter */}
                        <button
                            onClick={() => setShowReplyNeeded(!showReplyNeeded)}
                            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${showReplyNeeded
                                ? 'bg-red-100 text-red-700 border border-red-300'
                                : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'
                                }`}
                        >
                            <FlagIcon className="w-4 h-4" aria-hidden="true" />
                            Reply Needed {replyNeededCount > 0 && `(${replyNeededCount})`}
                        </button>

                        {/* Stale Filter */}
                        <button
                            onClick={() => setShowOnlyStale(!showOnlyStale)}
                            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${showOnlyStale
                                ? 'bg-amber-100 text-amber-700 border border-amber-300'
                                : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'
                                }`}
                        >
                            <ClockIcon className="w-4 h-4" aria-hidden="true" />
                            Stale {staleCount > 0 && `(${staleCount})`}
                        </button>
                    </div>
                </div>
            </div>

            {/* Kanban Board */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {groupedCompanies.map(column => (
                    <div key={column.id} className="flex flex-col">
                        {/* Column Header */}
                        <div className={`${column.color} border-2 rounded-t-xl px-4 py-3`}>
                            <h3 className="font-semibold text-slate-900 text-sm">
                                {column.label}
                            </h3>
                            <p className="text-xs text-slate-600 mt-0.5">
                                {column.companies.length} {column.companies.length === 1 ? 'company' : 'companies'}
                            </p>
                        </div>

                        {/* Column Content */}
                        <div className={`${column.color.replace('50', '25')} border-2 border-t-0 ${column.color.split(' ')[1]} rounded-b-xl p-3 space-y-3 min-h-[400px]`}>
                            {column.companies.length === 0 ? (
                                <div className="flex items-center justify-center h-32 text-sm text-slate-400">
                                    No companies
                                </div>
                            ) : (
                                column.companies.map(company => (
                                    <div
                                        key={company.id}
                                        onClick={() => onCompanyClick?.(company.id)}
                                        className={`bg-white rounded-lg border-2 p-4 cursor-pointer transition-all hover:shadow-md group ${company.replyNeeded ? 'border-red-400 bg-red-50 ring-2 ring-red-200' :
                                                company.isStale ? 'border-amber-400 bg-amber-50' : 'border-slate-200'
                                            }`}
                                        role="button"
                                        tabIndex={0}
                                        onKeyPress={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                onCompanyClick?.(company.id);
                                            }
                                        }}
                                    >
                                        {/* Flags */}
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                            <h4 className="font-medium text-slate-900 text-sm leading-tight flex-1">
                                                {company.name}
                                            </h4>
                                            {company.isFlagged && (
                                                <FlagIcon className="w-4 h-4 text-red-500 flex-shrink-0" aria-label="Flagged" />
                                            )}
                                        </div>

                                        {/* Contact */}
                                        <p className="text-xs text-slate-600 mb-1 truncate">
                                            {company.contact}
                                        </p>
                                        <p className="text-xs text-slate-500 mb-3 truncate">
                                            {company.email}
                                        </p>

                                        {/* Footer */}
                                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                            <div className="flex items-center gap-1 text-xs text-slate-500">
                                                <ClockIcon className="w-3.5 h-3.5" aria-hidden="true" />
                                                {formatDate(company.lastUpdated)}
                                            </div>

                                            <div className="flex gap-2">
                                                {company.replyNeeded && (
                                                    <span className="text-xs font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">
                                                        Reply Needed
                                                    </span>
                                                )}
                                                {company.isStale && !company.replyNeeded && (
                                                    <span className="text-xs font-medium text-amber-700">
                                                        Stale
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Empty State */}
            {filteredCompanies.length === 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                    <MagnifyingGlassIcon className="mx-auto w-12 h-12 text-slate-300 mb-3" />
                    <h3 className="text-sm font-medium text-slate-900 mb-1">No companies found</h3>
                    <p className="text-sm text-slate-500">
                        {searchTerm ? 'Try adjusting your search' : 'No companies assigned yet'}
                    </p>
                </div>
            )}
        </div>
    );
}
