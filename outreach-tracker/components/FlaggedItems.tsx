import React from 'react';
import { FlagIcon, ClockIcon } from '@heroicons/react/24/solid';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface FlaggedCompany {
    id: string;
    name: string;
    status: string;
    assignedTo: string;
    reason?: string;
    flaggedDate: string;
}

interface FlaggedItemsProps {
    companies: FlaggedCompany[];
    onCompanyClick?: (companyId: string) => void;
}

export default function FlaggedItems({ companies, onCompanyClick }: FlaggedItemsProps) {
    if (companies.length === 0) {
        return (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
                <div className="text-center">
                    <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-3">
                        <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h3 className="text-sm font-medium text-slate-900 mb-1">No Flagged Items</h3>
                    <p className="text-sm text-slate-500">All companies are progressing smoothly</p>
                </div>
            </div>
        );
    }

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
        
        if (diffHours < 24) return 'Today';
        if (diffHours < 48) return 'Yesterday';
        
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const getStatusColor = (status: string) => {
        const colors: Record<string, string> = {
            'To Contact': 'bg-slate-100 text-slate-700',
            'Contacted': 'bg-blue-100 text-blue-700',
            'Negotiating': 'bg-amber-100 text-amber-700',
            'Closed': 'bg-green-100 text-green-700',
            'Rejected': 'bg-red-100 text-red-700',
        };
        return colors[status] || 'bg-slate-100 text-slate-700';
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-red-50">
                <div className="flex items-center gap-3">
                    <div className="bg-red-100 p-2 rounded-lg">
                        <ExclamationTriangleIcon className="w-5 h-5 text-red-600" aria-hidden="true" />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-semibold text-slate-900">Flagged Items</h3>
                        <p className="text-xs text-slate-600 mt-0.5">
                            {companies.length} {companies.length === 1 ? 'company needs' : 'companies need'} attention
                        </p>
                    </div>
                </div>
            </div>

            {/* List */}
            <div className="divide-y divide-slate-100">
                {companies.map((company) => (
                    <div
                        key={company.id}
                        onClick={() => onCompanyClick?.(company.id)}
                        className="px-6 py-4 hover:bg-slate-50 transition-colors cursor-pointer"
                        role="button"
                        tabIndex={0}
                        onKeyPress={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                onCompanyClick?.(company.id);
                            }
                        }}
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                                {/* Flag Icon */}
                                <FlagIcon className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" aria-hidden="true" />
                                
                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-medium text-slate-900 truncate">{company.name}</h4>
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(company.status)}`}>
                                            {company.status}
                                        </span>
                                        <span className="text-xs text-slate-500">•</span>
                                        <span className="text-xs text-slate-600">Assigned to {company.assignedTo}</span>
                                    </div>
                                    {company.reason && (
                                        <p className="text-sm text-slate-600 mt-2 line-clamp-2">{company.reason}</p>
                                    )}
                                </div>
                            </div>

                            {/* Time Badge */}
                            <div className="flex items-center gap-1 text-xs text-slate-500 flex-shrink-0">
                                <ClockIcon className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>{formatDate(company.flaggedDate)}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200">
                <button
                    className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                    onClick={() => {
                        // In real app, this would navigate to a filtered view
                        console.log('View all flagged items');
                    }}
                >
                    View All Flagged Items →
                </button>
            </div>
        </div>
    );
}
