import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
    MagnifyingGlassIcon,
    FunnelIcon,
    ArrowsUpDownIcon,
    ChevronUpIcon,
    ChevronDownIcon,
    EyeIcon,
    FlagIcon,
    XMarkIcon
} from '@heroicons/react/24/outline';

interface Company {
    id: string;
    name: string;
    status: string;
    assignedTo: string;
    contact: string;
    email: string;
    lastUpdated: string;
    isFlagged: boolean;
    discipline?: string;
    targetSponsorshipTier?: string;
    followUpsCompleted?: number;
}

interface AllCompaniesTableProps {
    companies: Company[];
    onCompanyClick?: (companyId: string) => void;
    selectedCompanies?: Set<string>;
    onSelectionChange?: (selected: Set<string>) => void;
    lastSelectedIndex?: number | null;
    onLastSelectedIndexChange?: (index: number | null) => void;
}

interface FilterRowMultiSelectProps {
    options: string[];
    selected: string[];
    onChange: (selected: string[]) => void;
    placeholder?: string;
}

function FilterRowMultiSelect({ options, selected, onChange, placeholder = 'All' }: FilterRowMultiSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        if (isOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const toggleOption = (option: string) => {
        const newSelected = selected.includes(option)
            ? selected.filter(s => s !== option)
            : [...selected, option];
        onChange(newSelected);
    };

    const displayValue = selected.length === 0
        ? placeholder
        : selected.length === 1
            ? selected[0]
            : `${selected.length} selected`;

    return (
        <div className="relative w-full" ref={containerRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-left flex items-center justify-between"
            >
                <span className="truncate block">{displayValue}</span>
                <ChevronDownIcon className="w-3 h-3 text-slate-400 flex-shrink-0 ml-1" />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto p-1.5">
                    <div className="flex gap-2 px-2 py-1 mb-1 border-b border-slate-100 pb-1">
                        <button
                            onClick={() => onChange(options)}
                            className="text-[10px] text-blue-600 font-medium hover:underline"
                        >
                            Select All
                        </button>
                        <button
                            onClick={() => onChange([])}
                            className="text-[10px] text-slate-500 font-medium hover:underline"
                        >
                            Clear
                        </button>
                    </div>
                    {options.map(option => (
                        <label key={option} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer">
                            <input
                                type="checkbox"
                                checked={selected.includes(option)}
                                onChange={() => toggleOption(option)}
                                className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-xs text-slate-700">{option}</span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
}

type SortField = 'id' | 'name' | 'status' | 'assignedTo' | 'lastUpdated' | 'followUpsCompleted' | 'targetSponsorshipTier';
type SortDirection = 'asc' | 'desc';

export default function AllCompaniesTable({
    companies,
    onCompanyClick,
    selectedCompanies = new Set(),
    onSelectionChange = () => { },
    lastSelectedIndex,
    onLastSelectedIndexChange = () => { }
}: AllCompaniesTableProps) {
    const [sortField, setSortField] = useState<SortField>('id');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    const [columnFilters, setColumnFilters] = useState({
        id: '',
        name: '',
        status: [] as string[],
        discipline: [] as string[],
        targetSponsorshipTier: [] as string[],
        assignedTo: [] as string[],
        contact: ''
    });

    // Get unique statuses, disciplines and assignees for filters
    const statuses = useMemo(() =>
        Array.from(new Set(companies.map(c => c.status))).sort(),
        [companies]
    );
    const disciplines = useMemo(() => {
        const all = new Set<string>();
        companies.forEach(c => {
            if (c.discipline) {
                c.discipline.split(',').forEach(d => {
                    const trimmed = d.trim();
                    if (trimmed) all.add(trimmed);
                });
            }
        });
        return Array.from(all).sort();
    }, [companies]);
    const targetTiers = useMemo(() =>
        Array.from(new Set(companies.map(c => c.targetSponsorshipTier).filter(Boolean) as string[])).sort(),
        [companies]
    );
    const assignees = useMemo(() =>
        Array.from(new Set(companies.map(c => c.assignedTo))).sort(),
        [companies]
    );

    // Detect ID gaps
    const idGapInfo = useMemo(() => {
        if (companies.length === 0) return null;

        const ids = companies.map(c => {
            const match = c.id.match(/ME-(\d+)/);
            return match ? parseInt(match[1], 10) : 0;
        }).filter(id => id > 0).sort((a, b) => a - b);

        if (ids.length === 0) return null;

        const minId = ids[0];
        const maxId = ids[ids.length - 1];
        const expectedCount = maxId - minId + 1;
        const actualCount = ids.length;
        const gapCount = expectedCount - actualCount;

        return gapCount > 0 ? { minId, maxId, gapCount } : null;
    }, [companies]);

    // Filter and sort companies
    const filteredAndSortedCompanies = useMemo(() => {
        let result = companies.filter(company => {
            const matchesId = company.id.toLowerCase().includes(columnFilters.id.toLowerCase());
            const matchesName = company.name.toLowerCase().includes(columnFilters.name.toLowerCase());
            const matchesStatus = columnFilters.status.length === 0 || columnFilters.status.includes(company.status);
            const matchesDiscipline = columnFilters.discipline.length === 0 || (company.discipline && columnFilters.discipline.some(d => company.discipline?.includes(d)));
            const matchesTier = columnFilters.targetSponsorshipTier.length === 0 || (company.targetSponsorshipTier && columnFilters.targetSponsorshipTier.includes(company.targetSponsorshipTier));
            const matchesAssignee = columnFilters.assignedTo.length === 0 || columnFilters.assignedTo.includes(company.assignedTo);
            const matchesContact =
                company.contact.toLowerCase().includes(columnFilters.contact.toLowerCase()) ||
                company.email.toLowerCase().includes(columnFilters.contact.toLowerCase());

            return matchesId && matchesName && matchesStatus && matchesDiscipline && matchesTier && matchesAssignee && matchesContact;
        });

        // Sort
        result.sort((a, b) => {
            let aValue: any = a[sortField];
            let bValue: any = b[sortField];

            if (sortField === 'lastUpdated') {
                aValue = new Date(aValue).getTime();
                bValue = new Date(bValue).getTime();
            } else {
                aValue = aValue?.toLowerCase() || '';
                bValue = bValue?.toLowerCase() || '';
            }

            if (sortDirection === 'asc') {
                return aValue > bValue ? 1 : -1;
            } else {
                return aValue < bValue ? 1 : -1;
            }
        });

        return result;
    }, [companies, columnFilters, sortField, sortDirection]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const getStatusColor = (status: string) => {
        const colors: Record<string, string> = {
            'To Contact': 'bg-slate-100 text-slate-700',
            'Contacted': 'bg-blue-100 text-blue-700',
            'Interested': 'bg-purple-100 text-purple-700',
            'Registered': 'bg-green-100 text-green-700',
            'Rejected': 'bg-red-100 text-red-700',
            'No Reply': 'bg-gray-100 text-gray-500',
        };
        return colors[status] || 'bg-slate-100 text-slate-700';
    };

    const getDisciplineColor = (discipline: string) => {
        const colors: Record<string, string> = {
            'MEC': 'bg-blue-50 text-blue-700 border-blue-100',
            'ECSE': 'bg-indigo-50 text-indigo-700 border-indigo-100',
            'CHE': 'bg-teal-50 text-teal-700 border-teal-100',
            'CIV': 'bg-amber-50 text-amber-700 border-amber-100',
            'SE': 'bg-purple-50 text-purple-700 border-purple-100',
            'TRC': 'bg-rose-50 text-rose-700 border-rose-100',
            'CS': 'bg-cyan-50 text-cyan-700 border-cyan-100',
            'DS': 'bg-emerald-50 text-emerald-700 border-emerald-100',
            'AI': 'bg-violet-50 text-violet-700 border-violet-100',
        };
        return colors[discipline] || 'bg-slate-50 text-slate-600 border-slate-100';
    };

    // Handle checkbox clicks with shift-click range selection
    const handleCheckboxClick = (companyId: string, index: number, event: React.MouseEvent) => {
        const newSelected = new Set(selectedCompanies);

        // Shift+click range selection
        if (event.shiftKey && lastSelectedIndex !== null && filteredAndSortedCompanies) {
            const start = Math.min(lastSelectedIndex as number, index);
            const end = Math.max(lastSelectedIndex as number, index);

            // Select all companies in range
            for (let i = start; i <= end; i++) {
                if (filteredAndSortedCompanies[i]) {
                    newSelected.add(filteredAndSortedCompanies[i].id);
                }
            }
        } else {
            // Normal click - toggle selection
            if (newSelected.has(companyId)) {
                newSelected.delete(companyId);
            } else {
                newSelected.add(companyId);
            }
        }

        onSelectionChange(newSelected);
        onLastSelectedIndexChange(index);
    };

    // Select all filtered companies
    const handleSelectAll = () => {
        const allIds = new Set(filteredAndSortedCompanies.map(c => c.id));
        onSelectionChange(allIds);
    };

    // Clear selection
    const handleClearSelection = () => {
        onSelectionChange(new Set());
        onLastSelectedIndexChange(null);
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) {
            return <ArrowsUpDownIcon className="w-4 h-4 text-slate-400" />;
        }
        return sortDirection === 'asc'
            ? <ChevronUpIcon className="w-4 h-4 text-blue-600" />
            : <ChevronDownIcon className="w-4 h-4 text-blue-600" />;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900">All Companies</h2>
                        <div className="flex items-center gap-2 mt-1">
                            {filteredAndSortedCompanies.length !== companies.length ? (
                                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 font-medium text-xs">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                                    Showing {filteredAndSortedCompanies.length} results
                                </div>
                            ) : (
                                <p className="text-sm text-slate-600">
                                    Total {companies.length} companies
                                </p>
                            )}
                            {filteredAndSortedCompanies.length !== companies.length && (
                                <span className="text-xs text-slate-400">
                                    (out of {companies.length} total)
                                </span>
                            )}
                            {idGapInfo && (
                                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium text-xs" title={`${idGapInfo.gapCount} ID${idGapInfo.gapCount > 1 ? 's' : ''} missing between ME-${String(idGapInfo.minId).padStart(4, '0')} and ME-${String(idGapInfo.maxId).padStart(4, '0')}`}>
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                    {idGapInfo.gapCount} ID gap{idGapInfo.gapCount > 1 ? 's' : ''}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Clear Filters Button */}
                    {(columnFilters.id || columnFilters.name || columnFilters.status.length > 0 ||
                        columnFilters.discipline.length > 0 || columnFilters.targetSponsorshipTier.length > 0 || columnFilters.assignedTo.length > 0 || columnFilters.contact) && (
                            <button
                                onClick={() => setColumnFilters({
                                    id: '',
                                    name: '',
                                    status: [],
                                    discipline: [],
                                    targetSponsorshipTier: [],
                                    assignedTo: [],
                                    contact: ''
                                })}
                                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                            >
                                Clear All Filters
                            </button>
                        )}
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div
                    className="overflow-y-auto max-h-[calc(100vh-280px)]"
                    style={{ scrollbarGutter: 'stable' }}
                >
                    <table className="w-full text-left text-sm" style={{ tableLayout: 'fixed' }}>
                        <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                            <tr>
                                <th className="px-4 py-3 text-xs font-medium text-slate-600 tracking-wider w-[50px] bg-slate-50">
                                    <input
                                        type="checkbox"
                                        checked={selectedCompanies.size > 0 && selectedCompanies.size === filteredAndSortedCompanies.length}
                                        onChange={(e) => e.target.checked ? handleSelectAll() : handleClearSelection()}
                                        className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                                        title="Select All"
                                    />
                                </th>
                                <th className="px-6 py-3 text-xs font-medium text-slate-600 tracking-wider w-[120px] bg-slate-50">
                                    <button
                                        onClick={() => handleSort('id')}
                                        className="flex items-center gap-2 hover:text-slate-900 transition-colors"
                                    >
                                        ID
                                        <SortIcon field="id" />
                                    </button>
                                </th>
                                <th className="px-6 py-3 text-xs font-medium text-slate-600 tracking-wider w-[240px] bg-slate-50">
                                    <button
                                        onClick={() => handleSort('name')}
                                        className="flex items-center gap-2 hover:text-slate-900 transition-colors"
                                    >
                                        Company Name
                                        <SortIcon field="name" />
                                    </button>
                                </th>
                                <th className="px-6 py-3 text-xs font-medium text-slate-600 tracking-wider w-[180px] bg-slate-50">
                                    <button
                                        onClick={() => handleSort('status')}
                                        className="flex items-center gap-2 hover:text-slate-900 transition-colors"
                                    >
                                        Status
                                        <SortIcon field="status" />
                                    </button>
                                </th>
                                <th className="px-6 py-3 text-xs font-medium text-slate-600 tracking-wider w-[180px] bg-slate-50">
                                    <span>Discipline</span>
                                </th>
                                <th className="px-6 py-3 text-xs font-medium text-slate-600 tracking-wider w-[180px] bg-slate-50">
                                    <button
                                        onClick={() => handleSort('targetSponsorshipTier')}
                                        className="flex items-center gap-2 hover:text-slate-900 transition-colors"
                                    >
                                        Target Tier
                                        <SortIcon field="targetSponsorshipTier" />
                                    </button>
                                </th>
                                <th className="px-6 py-3 text-xs font-medium text-slate-600 tracking-wider w-[160px] bg-slate-50">
                                    <button
                                        onClick={() => handleSort('assignedTo')}
                                        className="flex items-center gap-2 hover:text-slate-900 transition-colors"
                                    >
                                        Assigned To
                                        <SortIcon field="assignedTo" />
                                    </button>
                                </th>
                                <th className="px-6 py-3 text-xs font-medium text-slate-600 tracking-wider w-[220px] bg-slate-50">
                                    <span>Contact Person</span>
                                </th>
                                <th className="px-6 py-3 text-xs font-medium text-slate-600 tracking-wider w-[180px] bg-slate-50">
                                    <button
                                        onClick={() => handleSort('lastUpdated')}
                                        className="flex items-center gap-2 hover:text-slate-900 transition-colors"
                                    >
                                        Last Updated
                                        <SortIcon field="lastUpdated" />
                                    </button>
                                </th>
                                <th className="px-6 py-3 text-xs font-medium text-slate-600 tracking-wider w-[100px] bg-slate-50">
                                    <button
                                        onClick={() => handleSort('followUpsCompleted')}
                                        className="flex items-center gap-2 hover:text-slate-900 transition-colors"
                                    >
                                        Follow Ups
                                        <SortIcon field="followUpsCompleted" />
                                    </button>
                                </th>
                            </tr>
                            {/* Filter Row */}
                            <tr className="bg-white border-b border-slate-200">
                                <th className="px-4 py-2 w-[50px] bg-white"></th>
                                <th className="px-6 py-2 w-[120px] bg-white">
                                    <input
                                        type="text"
                                        value={columnFilters.id}
                                        onChange={(e) => setColumnFilters({ ...columnFilters, id: e.target.value })}
                                        placeholder="Filter..."
                                        className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                </th>
                                <th className="px-6 py-2 w-[240px] bg-white">
                                    <input
                                        type="text"
                                        value={columnFilters.name}
                                        onChange={(e) => setColumnFilters({ ...columnFilters, name: e.target.value })}
                                        placeholder="Filter..."
                                        className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                </th>
                                <th className="px-6 py-2 w-[180px] bg-white">
                                    <FilterRowMultiSelect
                                        options={statuses}
                                        selected={columnFilters.status}
                                        onChange={(selected) => setColumnFilters({ ...columnFilters, status: selected })}
                                        placeholder="All"
                                    />
                                </th>
                                <th className="px-6 py-2 w-[180px] bg-white">
                                    <FilterRowMultiSelect
                                        options={disciplines}
                                        selected={columnFilters.discipline}
                                        onChange={(selected) => setColumnFilters({ ...columnFilters, discipline: selected })}
                                        placeholder="All"
                                    />
                                </th>
                                <th className="px-6 py-2 w-[180px] bg-white">
                                    <FilterRowMultiSelect
                                        options={targetTiers}
                                        selected={columnFilters.targetSponsorshipTier}
                                        onChange={(selected) => setColumnFilters({ ...columnFilters, targetSponsorshipTier: selected })}
                                        placeholder="All"
                                    />
                                </th>
                                <th className="px-6 py-2 w-[160px] bg-white">
                                    <FilterRowMultiSelect
                                        options={assignees}
                                        selected={columnFilters.assignedTo}
                                        onChange={(selected) => setColumnFilters({ ...columnFilters, assignedTo: selected })}
                                        placeholder="All"
                                    />
                                </th>
                                <th className="px-6 py-2 w-[220px] bg-white">
                                    <input
                                        type="text"
                                        value={columnFilters.contact}
                                        onChange={(e) => setColumnFilters({ ...columnFilters, contact: e.target.value })}
                                        placeholder="Filter..."
                                        className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                </th>
                                <th className="px-6 py-2 w-[180px] bg-white"></th>
                                <th className="px-6 py-2 w-[100px] bg-white"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredAndSortedCompanies.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="px-6 py-12 text-center">
                                        <MagnifyingGlassIcon className="mx-auto w-12 h-12 text-slate-300 mb-3" />
                                        <p className="text-sm text-slate-600 font-medium">No companies found</p>
                                        <p className="text-xs text-slate-500 mt-1">Try adjusting your search or filters</p>
                                    </td>
                                </tr>
                            ) : (
                                filteredAndSortedCompanies.map((company, index) => (
                                    <tr
                                        key={company.id}
                                        onClick={() => onCompanyClick?.(company.id)}
                                        className="hover:bg-slate-50 transition-colors group cursor-pointer"
                                    >
                                        <td className="px-4 py-4 w-[50px]">
                                            <input
                                                type="checkbox"
                                                checked={selectedCompanies.has(company.id)}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleCheckboxClick(company.id, index, e);
                                                }}
                                                className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                                            />
                                        </td>
                                        <td className="px-6 py-4 text-xs font-mono text-slate-500 whitespace-nowrap w-[120px]">
                                            {company.id}
                                        </td>
                                        <td className="px-6 py-4 w-[240px]">
                                            <div className="flex items-center gap-2">
                                                {company.isFlagged && (
                                                    <FlagIcon className="w-4 h-4 text-red-500 flex-shrink-0" aria-label="Flagged" />
                                                )}
                                                <span className="font-medium text-slate-900">{company.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 w-[180px]">
                                            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${getStatusColor(company.status)}`}>
                                                {company.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 w-[180px]">
                                            <div className="flex flex-wrap gap-1">
                                                {company.discipline ? company.discipline.split(',').map(d => {
                                                    const trimmed = d.trim();
                                                    if (!trimmed) return null;
                                                    return (
                                                        <span
                                                            key={trimmed}
                                                            className={`inline-flex px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase tracking-tight ${getDisciplineColor(trimmed)}`}
                                                        >
                                                            {trimmed}
                                                        </span>
                                                    );
                                                }) : (
                                                    <span className="text-slate-300 italic text-xs">N/A</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 w-[180px]">
                                            <span className="text-slate-700">{company.targetSponsorshipTier || 'N/A'}</span>
                                        </td>
                                        <td className="px-6 py-4 text-slate-700 w-[160px]">
                                            {company.assignedTo}
                                        </td>
                                        <td className="px-6 py-4 w-[220px]">
                                            <div className="text-slate-700 font-medium">{company.contact}</div>
                                        </td>
                                        <td className="px-6 py-4 text-slate-600 w-[180px] whitespace-nowrap">
                                            {formatDate(company.lastUpdated)}
                                        </td>
                                        <td className="px-6 py-4 text-center w-[100px]">
                                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-50 text-blue-700 font-semibold text-xs border border-blue-100">
                                                {company.followUpsCompleted || 0}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
