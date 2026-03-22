import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    MagnifyingGlassIcon,
    ClockIcon,
    FlagIcon,
    Squares2X2Icon,
    ListBulletIcon,
    CheckCircleIcon,
    ArrowPathIcon,
    ChatBubbleOvalLeftEllipsisIcon,
    ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline';
import { useBackgroundTasks } from '../contexts/BackgroundTasksContext';

interface Company {
    id: string;
    name: string;
    contactStatus: string;
    relationshipStatus: string;
    contact: string;
    email: string;
    lastUpdated: string;
    isFlagged: boolean;
    isStale: boolean;
    replyNeeded?: boolean;
    scheduledTime?: string;
    scheduledDate?: string;
    scheduledIsOverdue?: boolean;
    scheduleNote?: string;
    followUpsCompleted?: number;
    lastContact?: string;
    previousResponse?: string;
}

interface CommitteeWorkspaceProps {
    companies: Company[];
    memberName: string;
    onCompanyClick?: (companyId: string) => void;
    onRefresh?: () => void;
}

const TOOLTIP_DELAY_MS = 300;

function getNowDatetimeLocal(): string {
    const n = new Date();
    const pad = (x: number) => String(x).padStart(2, '0');
    return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}T${pad(n.getHours())}:${pad(n.getMinutes())}`;
}

const contactStatusColumns = [
    { id: 'To Contact', label: 'To Contact', color: 'bg-slate-100 border-slate-300', accent: 'border-l-slate-400' },
    { id: 'Contacted', label: 'Contacted', color: 'bg-blue-50 border-blue-300', accent: 'border-l-blue-400' },
    { id: 'To Follow Up', label: 'To Follow Up', color: 'bg-amber-50 border-amber-300', accent: 'border-l-amber-400' },
    { id: 'No Reply', label: 'No Reply', color: 'bg-slate-50 border-slate-300', accent: 'border-l-slate-400' },
];

const relationshipStatusColumns = [
    { id: 'Interested', label: 'Interested', color: 'bg-purple-50 border-purple-300', accent: 'border-l-purple-400' },
    { id: 'Registered', label: 'Registered', color: 'bg-green-50 border-green-300', accent: 'border-l-green-400' },
    { id: 'Rejected', label: 'Rejected', color: 'bg-red-50 border-red-300', accent: 'border-l-red-400' },
    { id: '', label: 'No Status', color: 'bg-slate-50 border-slate-200', accent: 'border-l-slate-300' },
];

export default function CommitteeWorkspace({
    companies,
    memberName,
    onCompanyClick,
    onRefresh,
}: CommitteeWorkspaceProps) {
    const { addTask, completeTask, failTask } = useBackgroundTasks();
    const [searchTerm, setSearchTerm] = useState('');
    const [showOnlyStale, setShowOnlyStale] = useState(false);
    const [showReplyNeeded, setShowReplyNeeded] = useState(false);
    const [tooltip, setTooltip] = useState<{ name: string; rect: DOMRect } | null>(null);
    const tooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const hoveredElementRef = useRef<HTMLElement | null>(null);
    const [cardLayout, setCardLayout] = useState<'full' | 'compact'>('full');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
    const [bulkUpdating, setBulkUpdating] = useState(false);
    const [bulkRemark, setBulkRemark] = useState('');
    const [bulkActionDate, setBulkActionDate] = useState(getNowDatetimeLocal);
    const [kanbanView, setKanbanView] = useState<'contact' | 'relationship'>('contact');

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

    // Group by the active kanban view
    const activeColumns = kanbanView === 'contact' ? contactStatusColumns : relationshipStatusColumns;
    const groupedCompanies = activeColumns.map(column => ({
        ...column,
        companies: filteredCompanies.filter(c =>
            kanbanView === 'contact'
                ? c.contactStatus === column.id
                : c.relationshipStatus === column.id
        )
    }));

    // Flat list in display order: must match render order (column order, then companies as shown in each column - no sort)
    const companiesInOrder = useMemo(
        () => groupedCompanies.flatMap(col => [...col.companies]),
        [groupedCompanies]
    );

    const handleCompanySelect = useCallback((company: Company, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const id = company.id;
        if (e.shiftKey) {
            setSelectedIds(prev => {
                if (!lastSelectedId) return new Set([id]);
                const idxLast = companiesInOrder.findIndex(c => c.id === lastSelectedId);
                const idxCur = companiesInOrder.findIndex(c => c.id === id);
                if (idxLast === -1 || idxCur === -1) return new Set([id]);
                const [lo, hi] = idxLast <= idxCur ? [idxLast, idxCur] : [idxCur, idxLast];
                const next = new Set(prev);
                for (let i = lo; i <= hi; i++) next.add(companiesInOrder[i].id);
                return next;
            });
            setLastSelectedId(id);
            return;
        }
        if (e.ctrlKey || e.metaKey) {
            setSelectedIds(prev => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
            });
            setLastSelectedId(id);
            return;
        }
        setSelectedIds(prev => (prev.has(id) && prev.size === 1 ? new Set() : new Set([id])));
        setLastSelectedId(id);
    }, [lastSelectedId, companiesInOrder]);

    const handleCompanyDoubleClick = useCallback((companyId: string) => {
        onCompanyClick?.(companyId);
    }, [onCompanyClick]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setSelectedIds(new Set());
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    const selectedCompanies = useMemo(
        () => companies.filter(c => selectedIds.has(c.id)),
        [companies, selectedIds]
    );

    const getBulkTimestamp = useCallback(() => bulkActionDate.trim() ? new Date(bulkActionDate.trim()).toISOString() : new Date().toISOString(), [bulkActionDate]);

    // Log outreach: for To Contact; Log follow up: for Contacted/No Reply or (Interested/Registered + 3+ days no response)
    const isFollowUpEligible = useCallback((c: Company) => {
        if (c.contactStatus === 'Contacted' || c.contactStatus === 'No Reply') return true;
        if (c.relationshipStatus !== 'Interested' && c.relationshipStatus !== 'Registered') return false;
        const lastContact = c.lastContact ? new Date(c.lastContact).getTime() : 0;
        const lastResponse = c.previousResponse ? new Date(c.previousResponse).getTime() : 0;
        const isWaitingForCompanyReply = lastContact > 0 && (!lastResponse || lastContact > lastResponse);
        const daysSinceOurLastMessage = lastContact > 0 ? (Date.now() - lastContact) / (1000 * 60 * 60 * 24) : 0;
        return isWaitingForCompanyReply && daysSinceOurLastMessage >= 3;
    }, []);

    const outreachCount = useMemo(() => selectedCompanies.filter(c => c.contactStatus === 'To Contact').length, [selectedCompanies]);
    const followUpCount = useMemo(() => selectedCompanies.filter(isFollowUpEligible).length, [selectedCompanies, isFollowUpEligible]);

    const markAsFirstOutreach = useCallback(async () => {
        if (outreachCount === 0 || !memberName || bulkUpdating) return;
        const toProcess = selectedCompanies.filter(c => c.contactStatus === 'To Contact');
        setBulkUpdating(true);
        const taskId = addTask('Logging first outreach...');
        const timestamp = getBulkTimestamp();
        const remarkText = bulkRemark.trim() ? `[Outreach] ${bulkRemark.trim()}` : 'Bulk: Sent first outreach';
        try {
            for (const c of toProcess) {
                const res = await fetch('/api/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        companyId: c.id,
                        user: memberName,
                        updates: { contactStatus: 'Contacted', followUpsCompleted: 0, lastContact: timestamp },
                        remark: remarkText,
                        actionDate: timestamp,
                    }),
                });
                if (!res.ok) throw new Error(`Update failed for ${c.id}`);
            }
            setSelectedIds(new Set());
            setLastSelectedId(null);
            setBulkRemark('');
            setBulkActionDate(getNowDatetimeLocal());
            onRefresh?.();
            completeTask(taskId, 'First outreach logged');
        } catch (err) {
            console.error('Bulk update failed', err);
            failTask(taskId, err instanceof Error ? err.message : 'Update failed');
        } finally {
            setBulkUpdating(false);
        }
    }, [selectedCompanies, outreachCount, memberName, bulkUpdating, bulkRemark, getBulkTimestamp, onRefresh, addTask, completeTask, failTask]);

    const markAsFollowUp = useCallback(async () => {
        if (followUpCount === 0 || !memberName || bulkUpdating) return;
        const toProcess = selectedCompanies.filter(isFollowUpEligible);
        setBulkUpdating(true);
        const taskId = addTask('Logging follow up...');
        const timestamp = getBulkTimestamp();
        try {
            for (const c of toProcess) {
                const nextCount = (c.followUpsCompleted ?? 0) + 1;
                const remarkText = bulkRemark.trim() ? `[Follow-up #${nextCount}] ${bulkRemark.trim()}` : `Bulk: Sent follow up (${nextCount})`;
                const res = await fetch('/api/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        companyId: c.id,
                        user: memberName,
                        updates: { followUpsCompleted: nextCount, lastContact: timestamp },
                        remark: remarkText,
                        actionDate: timestamp,
                    }),
                });
                if (!res.ok) throw new Error(`Update failed for ${c.id}`);
            }
            setSelectedIds(new Set());
            setLastSelectedId(null);
            setBulkRemark('');
            setBulkActionDate(getNowDatetimeLocal());
            onRefresh?.();
            completeTask(taskId, 'Follow up logged');
        } catch (err) {
            console.error('Bulk update failed', err);
            failTask(taskId, err instanceof Error ? err.message : 'Update failed');
        } finally {
            setBulkUpdating(false);
        }
    }, [selectedCompanies, followUpCount, memberName, bulkUpdating, bulkRemark, getBulkTimestamp, isFollowUpEligible, onRefresh, addTask, completeTask, failTask]);

    const markAsCompanyReply = useCallback(async () => {
        if (selectedCompanies.length === 0 || !memberName || bulkUpdating) return;
        setBulkUpdating(true);
        const taskId = addTask('Logging company response...');
        const timestamp = getBulkTimestamp();
        const remarkText = bulkRemark.trim() ? `[Company Reply] ${bulkRemark.trim()}` : '[Company Reply] Received';
        try {
            for (const c of selectedCompanies) {
                const res = await fetch('/api/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        companyId: c.id,
                        user: memberName,
                        updates: { contactStatus: 'To Follow Up', relationshipStatus: 'Interested' },
                        remark: remarkText,
                        actionDate: timestamp,
                    }),
                });
                if (!res.ok) throw new Error(`Update failed for ${c.id}`);
            }
            setSelectedIds(new Set());
            setLastSelectedId(null);
            setBulkRemark('');
            setBulkActionDate(getNowDatetimeLocal());
            onRefresh?.();
            completeTask(taskId, 'Company response logged');
        } catch (err) {
            console.error('Bulk update failed', err);
            failTask(taskId, err instanceof Error ? err.message : 'Update failed');
        } finally {
            setBulkUpdating(false);
        }
    }, [selectedCompanies, memberName, bulkUpdating, bulkRemark, getBulkTimestamp, onRefresh, addTask, completeTask, failTask]);

    const markAsOurReply = useCallback(async () => {
        if (selectedCompanies.length === 0 || !memberName || bulkUpdating) return;
        setBulkUpdating(true);
        const taskId = addTask('Logging our reply...');
        const timestamp = getBulkTimestamp();
        const remarkText = bulkRemark.trim() ? `[Our Reply] ${bulkRemark.trim()}` : '[Our Reply] Sent';
        try {
            for (const c of selectedCompanies) {
                const res = await fetch('/api/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        companyId: c.id,
                        user: memberName,
                        updates: { lastContact: timestamp },
                        remark: remarkText,
                        actionDate: timestamp,
                    }),
                });
                if (!res.ok) throw new Error(`Update failed for ${c.id}`);
            }
            setSelectedIds(new Set());
            setLastSelectedId(null);
            setBulkRemark('');
            setBulkActionDate(getNowDatetimeLocal());
            onRefresh?.();
            completeTask(taskId, 'Our reply logged');
        } catch (err) {
            console.error('Bulk update failed', err);
            failTask(taskId, err instanceof Error ? err.message : 'Update failed');
        } finally {
            setBulkUpdating(false);
        }
    }, [selectedCompanies, memberName, bulkUpdating, bulkRemark, getBulkTimestamp, onRefresh, addTask, completeTask, failTask]);

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

            {/* Kanban View Toggle */}
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit">
                <button
                    onClick={() => { setKanbanView('contact'); setSelectedIds(new Set()); setLastSelectedId(null); }}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${kanbanView === 'contact' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                    Contact Status
                </button>
                <button
                    onClick={() => { setKanbanView('relationship'); setSelectedIds(new Set()); setLastSelectedId(null); }}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${kanbanView === 'relationship' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                    Relationship Status
                </button>
            </div>

            {/* Kanban Board */}
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${kanbanView === 'contact' ? 'lg:grid-cols-4' : 'lg:grid-cols-3 xl:grid-cols-4'} gap-4 items-stretch`}>
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
                                column.companies.map(company => {
                                    const isSelected = selectedIds.has(company.id);
                                    return (
                                    <div
                                        key={company.id}
                                        onClick={(e) => handleCompanySelect(company, e)}
                                        onDoubleClick={() => handleCompanyDoubleClick(company.id)}
                                        onMouseLeave={handleNameMouseLeave}
                                        className={`relative bg-white rounded border py-1.5 px-2 cursor-pointer transition-all hover:shadow-sm min-w-0 flex items-center gap-2 select-none ${isSelected ? 'ring-2 ring-blue-500 border-blue-400 bg-blue-50/50' : ''} ${company.replyNeeded ? 'border-slate-200 border-r-2 border-r-red-300 bg-red-50/50' : company.isStale ? 'border-2 border-amber-300 bg-amber-50/30' : 'border-slate-200'}`}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                handleCompanySelect(company, e as unknown as React.MouseEvent);
                                            }
                                        }}
                                    >
                                        {isSelected && <CheckCircleIcon className="w-4 h-4 text-blue-600 flex-shrink-0" aria-hidden />}
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
                                    );
                                })
                            ) : (
                                column.companies.map(company => {
                                    const isSelected = selectedIds.has(company.id);
                                    return (
                                    <div
                                        key={company.id}
                                        onClick={(e) => handleCompanySelect(company, e)}
                                        onDoubleClick={() => handleCompanyDoubleClick(company.id)}
                                        onMouseLeave={handleNameMouseLeave}
                                        className={`relative bg-white rounded-lg border p-2.5 cursor-pointer transition-all hover:shadow-sm group min-w-0 flex-shrink-0 select-none ${isSelected ? 'ring-2 ring-blue-500 border-blue-400 bg-blue-50/50' : ''} ${company.replyNeeded ? 'border-red-300 bg-red-50/80' :
                                                company.isStale ? 'border-amber-300 bg-amber-50/80' : 'border-slate-200'
                                            }`}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                handleCompanySelect(company, e as unknown as React.MouseEvent);
                                            }
                                        }}
                                    >
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            {isSelected && <CheckCircleIcon className="w-4 h-4 text-blue-600 flex-shrink-0" aria-hidden />}
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
                                        {company.scheduledTime && (
                                            <div className="flex flex-col gap-0.5 mt-0.5">
                                                <div className="flex items-center gap-1">
                                                    <ClockIcon className={`w-3 h-3 flex-shrink-0 ${company.scheduledIsOverdue ? 'text-red-400' : 'text-indigo-400'}`} />
                                                    <span className={`text-[10px] font-medium ${company.scheduledIsOverdue ? 'text-red-600' : 'text-indigo-500'}`}>
                                                        {company.scheduledDate} {company.scheduledTime}
                                                    </span>
                                                </div>
                                                {company.scheduleNote && (
                                                    <p className="text-[10px] text-slate-500 italic truncate pl-4" title={company.scheduleNote}>
                                                        {company.scheduleNote}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between gap-1.5 mt-0.5 min-w-0">
                                            <span className="text-xs text-slate-500 truncate">
                                                {company.contact ? `${company.contact} · ${formatDate(company.lastUpdated)}` : formatDate(company.lastUpdated)}
                                            </span>
                                            <div className="flex gap-1.5 flex-shrink-0 flex-wrap justify-end">
                                                {company.relationshipStatus && kanbanView === 'contact' && (
                                                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                                                        company.relationshipStatus === 'Interested' ? 'text-purple-700 bg-purple-100' :
                                                        company.relationshipStatus === 'Registered' ? 'text-green-700 bg-green-100' :
                                                        company.relationshipStatus === 'Rejected' ? 'text-red-700 bg-red-100' :
                                                        'text-slate-600 bg-slate-100'
                                                    }`}>{company.relationshipStatus}</span>
                                                )}
                                                {kanbanView === 'relationship' && (
                                                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                                                        company.contactStatus === 'To Contact' ? 'text-slate-600 bg-slate-100' :
                                                        company.contactStatus === 'Contacted' ? 'text-blue-700 bg-blue-100' :
                                                        company.contactStatus === 'To Follow Up' ? 'text-amber-700 bg-amber-100' :
                                                        'text-gray-600 bg-gray-100'
                                                    }`}>{company.contactStatus || 'To Contact'}</span>
                                                )}
                                                {company.replyNeeded && (
                                                    <span className="text-[10px] font-semibold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">Reply</span>
                                                )}
                                                {company.isStale && !company.replyNeeded && (
                                                    <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Stale</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Multi-select action bar */}
            {selectedIds.size >= 1 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl mx-4">
                    <div className="bg-slate-800 text-white rounded-xl shadow-xl p-4 flex flex-col gap-4">
                        <p className="text-sm font-medium">
                            {selectedIds.size} {selectedIds.size === 1 ? 'company' : 'companies'} selected · ESC to clear
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1">Remark (optional)</label>
                                <textarea
                                    value={bulkRemark}
                                    onChange={e => setBulkRemark(e.target.value)}
                                    placeholder="Add context for this action..."
                                    rows={2}
                                    className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1">Action date (optional)</label>
                                <input
                                    type="datetime-local"
                                    value={bulkActionDate}
                                    onChange={e => setBulkActionDate(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                                <p className="text-[10px] text-slate-400 mt-0.5">Leave empty for now</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {outreachCount > 0 && (
                                <button
                                    type="button"
                                    onClick={markAsFirstOutreach}
                                    disabled={bulkUpdating}
                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-medium transition-colors"
                                    title="Log first outreach (status → Contacted)"
                                >
                                    <ArrowPathIcon className="w-4 h-4" />
                                    {outreachCount === 1 ? 'Log outreach' : `Log outreach (${outreachCount})`}
                                </button>
                            )}
                            {followUpCount > 0 && (
                                <button
                                    type="button"
                                    onClick={markAsFollowUp}
                                    disabled={bulkUpdating}
                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-sm font-medium transition-colors"
                                    title="Log follow up (increment follow-up count)"
                                >
                                    <ArrowPathIcon className="w-4 h-4" />
                                    {followUpCount === 1 ? 'Log follow up' : `Log follow up (${followUpCount})`}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={markAsCompanyReply}
                                disabled={bulkUpdating}
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-sm font-medium transition-colors"
                                title="They replied to us — sets status to Interested"
                            >
                                <ChatBubbleOvalLeftEllipsisIcon className="w-4 h-4" />
                                Log company response
                            </button>
                            <button
                                type="button"
                                onClick={markAsOurReply}
                                disabled={bulkUpdating}
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium transition-colors"
                                title="We replied to them"
                            >
                                <ChatBubbleLeftRightIcon className="w-4 h-4" />
                                Log our reply
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
