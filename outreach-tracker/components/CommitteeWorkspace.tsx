import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    MagnifyingGlassIcon,
    ClockIcon,
    FlagIcon,
    Squares2X2Icon,
    ListBulletIcon
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

const TOOLTIP_DELAY_MS = 300;

const statusColumns = [
    { id: 'To Contact', label: 'To Contact', color: 'bg-slate-100 border-slate-300', accent: 'border-l-slate-400' },
    { id: 'Contacted', label: 'Contacted', color: 'bg-blue-50 border-blue-300', accent: 'border-l-blue-400' },
    { id: 'Interested', label: 'Interested', color: 'bg-orange-50 border-orange-300', accent: 'border-l-orange-400' },
    { id: 'Registered', label: 'Registered', color: 'bg-green-50 border-green-300', accent: 'border-l-green-400' },
    { id: 'Rejected', label: 'Rejected', color: 'bg-red-50 border-red-300', accent: 'border-l-red-400' },
    { id: 'No Reply', label: 'No Reply', color: 'bg-slate-50 border-slate-300', accent: 'border-l-slate-400' },
];

export default function CommitteeWorkspace({
    companies,
    memberName,
    onCompanyClick
}: CommitteeWorkspaceProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [showOnlyStale, setShowOnlyStale] = useState(false);
    const [showReplyNeeded, setShowReplyNeeded] = useState(false);
    const [tooltip, setTooltip] = useState<{ name: string; rect: DOMRect } | null>(null);
    const tooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const hoveredElementRef = useRef<HTMLElement | null>(null);
    const [cardLayout, setCardLayout] = useState<'full' | 'compact'>('full');

    const handleNameMouseEnter = useCallback((companyName: string) => {
        if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
        tooltipTimeoutRef.current = setTimeout(() => {
            const el = hoveredElementRef.current;
            if (el) {
                setTooltip({ name: companyName, rect: el.getBoundingClientRect() });
            }
        }, TOOLTIP_DELAY_MS);
    }, []);

    const handleNameMouseLeave = useCallback(() => {
        if (tooltipTimeoutRef.current) {
            clearTimeout(tooltipTimeoutRef.current);
            tooltipTimeoutRef.current = null;
        }
        hoveredElementRef.current = null;
        setTooltip(null);
    }, []);

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

                        {/* Layout toggle */}
                        <div className="flex rounded-lg border border-slate-300 overflow-hidden">
                            <button
                                onClick={() => setCardLayout('full')}
                                className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${cardLayout === 'full' ? 'bg-slate-100 text-slate-900' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                                title="Full cards"
                            >
                                <Squares2X2Icon className="w-4 h-4" />
                                Full
                            </button>
                            <button
                                onClick={() => setCardLayout('compact')}
                                className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${cardLayout === 'compact' ? 'bg-slate-100 text-slate-900' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                                title="Compact: name and date only"
                            >
                                <ListBulletIcon className="w-4 h-4" />
                                Compact
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Kanban Board - row height = tallest column (most companies), all columns match */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 items-stretch">
                {groupedCompanies.map(column => (
                    <div key={column.id} className="flex flex-col min-h-0">
                        {/* Column Header */}
                        <div className={`${column.color} border-2 rounded-t-xl px-4 py-3 flex-shrink-0`}>
                            <h3 className="font-semibold text-slate-900 text-sm">
                                {column.label}
                            </h3>
                            <p className="text-xs text-slate-600 mt-0.5">
                                {column.companies.length} {column.companies.length === 1 ? 'company' : 'companies'}
                            </p>
                        </div>

                        {/* Column Content - fills remaining height, scrolls when needed */}
                        <div className={`${column.color.replace('50', '25')} border-2 border-t-0 ${column.color.split(' ')[1]} rounded-b-xl p-3 space-y-3 flex-1 min-h-0 overflow-y-auto custom-scrollbar`}>
                            {column.companies.length === 0 ? (
                                <div className="flex items-center justify-center h-32 text-sm text-slate-400 flex-shrink-0">
                                    No companies
                                </div>
                            ) : cardLayout === 'compact' ? (
                                column.companies.map(company => (
                                    <div
                                        key={company.id}
                                        onClick={() => onCompanyClick?.(company.id)}
                                        onMouseLeave={handleNameMouseLeave}
                                        className={`relative bg-white rounded border py-1.5 px-2 cursor-pointer transition-all hover:shadow-sm min-w-0 flex items-center gap-2 ${company.replyNeeded ? 'border-slate-200 border-r-2 border-r-red-300 bg-red-50/50' : company.isStale ? 'border-2 border-amber-300 bg-amber-50/30' : 'border-slate-200'}`}
                                        role="button"
                                        tabIndex={0}
                                        onKeyPress={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') onCompanyClick?.(company.id);
                                        }}
                                    >
                                        <span
                                            className="font-medium text-slate-900 text-sm truncate flex-1 min-w-0"
                                            onMouseEnter={(e) => { hoveredElementRef.current = e.currentTarget as HTMLElement; handleNameMouseEnter(company.name); }}
                                        >
                                            {company.name}
                                        </span>
                                        <span className="text-xs text-slate-500 flex-shrink-0 tabular-nums">{formatDate(company.lastUpdated)}</span>
                                        {company.isFlagged && <FlagIcon className="w-3.5 h-3.5 text-red-500 flex-shrink-0" aria-label="Flagged" />}
                                        {company.replyNeeded && <span className="text-[10px] font-semibold text-red-600 bg-red-100 px-1 py-0.5 rounded flex-shrink-0">Reply</span>}
                                    </div>
                                ))
                            ) : (
                                column.companies.map(company => (
                                    <div
                                        key={company.id}
                                        onClick={() => onCompanyClick?.(company.id)}
                                        onMouseLeave={handleNameMouseLeave}
                                        className={`relative bg-white rounded-lg border p-2.5 cursor-pointer transition-all hover:shadow-sm group min-w-0 flex-shrink-0 ${company.replyNeeded ? 'border-red-300 bg-red-50/80' :
                                                company.isStale ? 'border-amber-300 bg-amber-50/80' : 'border-slate-200'
                                            }`}
                                        role="button"
                                        tabIndex={0}
                                        onKeyPress={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                onCompanyClick?.(company.id);
                                            }
                                        }}
                                    >
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <h4
                                                className="font-medium text-slate-900 text-sm truncate flex-1 min-w-0"
                                                onMouseEnter={(e) => { hoveredElementRef.current = e.currentTarget as HTMLElement; handleNameMouseEnter(company.name); }}
                                            >
                                                {company.name}
                                            </h4>
                                            {company.isFlagged && (
                                                <FlagIcon className="w-3.5 h-3.5 text-red-500 flex-shrink-0" aria-label="Flagged" />
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between gap-1.5 mt-0.5 min-w-0">
                                            <span className="text-xs text-slate-500 truncate">
                                                {company.contact ? `${company.contact} · ${formatDate(company.lastUpdated)}` : formatDate(company.lastUpdated)}
                                            </span>
                                            <div className="flex gap-1.5 flex-shrink-0">
                                                {company.replyNeeded && (
                                                    <span className="text-[10px] font-semibold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">Reply</span>
                                                )}
                                                {company.isStale && !company.replyNeeded && (
                                                    <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Stale</span>
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

            {typeof document !== 'undefined' && tooltip && createPortal(
                <div
                    className="px-2 py-1.5 text-xs font-medium text-white bg-slate-800 rounded shadow-lg max-w-[280px] whitespace-normal pointer-events-none"
                    style={{
                        position: 'fixed',
                        left: tooltip.rect.left,
                        top: tooltip.rect.top,
                        transform: 'translateY(-100%)',
                        marginTop: '-4px',
                        zIndex: 2147483647
                    }}
                >
                    {tooltip.name}
                </div>,
                document.body
            )}
        </div>
    );
}
