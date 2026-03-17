import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
    MagnifyingGlassIcon,
    ArrowsUpDownIcon,
    ChevronUpIcon,
    ChevronDownIcon,
    FlagIcon,
    XMarkIcon,
    Squares2X2Icon,
    CheckIcon,
    ClipboardDocumentIcon,
} from '@heroicons/react/24/outline';
import { formatTime } from '../lib/schedule-calculator';

/**
 * Strip accents / diacritics and lower-case a string so that e.g.
 * "L'Oréal" matches a search for "loreal" or "l'oreal".
 */
function normalise(str: string): string {
    return str
        .normalize('NFD')               // decompose é → e + combining accent
        .replace(/[\u0300-\u036f]/g, '') // strip combining marks
        .toLowerCase();
}

const GLOBAL_SEARCH_STORAGE_KEY = 'companies_globalSearch';

/**
 * Search input that only applies the filter when the user presses Enter (or clicks Clear).
 * Typing updates only local state so the table never re-renders until search is applied.
 */
function GlobalSearchInput({
    appliedValue,
    onApply,
    placeholder,
    className,
}: {
    appliedValue: string;
    onApply: (value: string) => void;
    placeholder: string;
    className?: string;
}) {
    const [localValue, setLocalValue] = useState(() => {
        if (typeof window !== 'undefined') {
            return sessionStorage.getItem(GLOBAL_SEARCH_STORAGE_KEY) || '';
        }
        return '';
    });

    const apply = (value: string) => {
        onApply(value);
        if (typeof window !== 'undefined') {
            sessionStorage.setItem(GLOBAL_SEARCH_STORAGE_KEY, value);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            apply(localValue);
        }
    };

    const handleClear = () => {
        setLocalValue('');
        apply('');
    };

    // Sync from parent when e.g. "Clear filters" resets appliedValue
    useEffect(() => {
        if (appliedValue === '' && localValue !== '') {
            setLocalValue('');
        }
    }, [appliedValue]);

    return (
        <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
                type="text"
                value={localValue}
                onChange={e => setLocalValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className={className}
                title="Press Enter to search"
            />
            {localValue ? (
                <button
                    type="button"
                    onClick={handleClear}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-600 transition-colors"
                    title="Clear and search"
                >
                    <XMarkIcon className="w-4 h-4" />
                </button>
            ) : null}
        </div>
    );
}

const COLUMN_WIDTHS = {
    select: 56,
    id: 120,
    name: 280,
    status: 200,
    discipline: 160,
    targetTier: 170,
    contact: 260,
    emails: 320,
    phones: 220,
    assignedTo: 180,
    scheduled: 170,
    lastUpdated: 200,
    followUps: 120,
} as const;

type ColumnKey = 'id' | 'status' | 'discipline' | 'targetTier' | 'contact' | 'emails' | 'phones' | 'assignedTo' | 'scheduled' | 'lastUpdated' | 'followUps';

const COLUMN_LABELS: Record<ColumnKey, string> = {
    id: 'ID',
    status: 'Status',
    discipline: 'Discipline',
    targetTier: 'Target Tier',
    contact: 'Contact Person',
    emails: 'Emails',
    phones: 'Phones',
    assignedTo: 'Assigned To',
    scheduled: 'Scheduled',
    lastUpdated: 'Last Updated',
    followUps: 'Follow Ups',
};

const DEFAULT_VISIBLE_COLUMNS: Record<ColumnKey, boolean> = {
    id: true,
    status: true,
    discipline: true,
    targetTier: true,
    contact: true,
    emails: false,
    phones: false,
    assignedTo: true,
    scheduled: false,
    lastUpdated: true,
    followUps: true,
};

interface Company {
    id: string;
    name: string;
    status: string;
    assignedTo: string;
    contact: string;
    email: string;
    phone?: string;
    lastUpdated: string;
    isFlagged: boolean;
    discipline?: string;
    targetSponsorshipTier?: string;
    followUpsCompleted?: number;
    scheduledDate?: string;
    scheduledTime?: string;
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

function ColumnPicker({
    visibleColumns,
    onChange,
}: {
    visibleColumns: Record<ColumnKey, boolean>;
    onChange: (cols: Record<ColumnKey, boolean>) => void;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
        };
        if (isOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const toggle = (key: ColumnKey) => {
        onChange({ ...visibleColumns, [key]: !visibleColumns[key] });
    };

    const visibleCount = Object.values(visibleColumns).filter(Boolean).length;

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setIsOpen(o => !o)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${isOpen ? 'bg-slate-100 border-slate-300 text-slate-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
                <Squares2X2Icon className="w-4 h-4" />
                Columns
                <span className="text-xs text-slate-400 font-normal">{visibleCount}/{Object.keys(COLUMN_LABELS).length}</span>
            </button>
            {isOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-2">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide px-2 mb-1.5">Toggle columns</p>
                    {(Object.keys(COLUMN_LABELS) as ColumnKey[]).map(key => (
                        <button
                            key={key}
                            onClick={() => toggle(key)}
                            className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-left transition-colors"
                        >
                            <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${visibleColumns[key] ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}>
                                {visibleColumns[key] && <CheckIcon className="w-3 h-3 text-white" />}
                            </span>
                            <span className="text-sm text-slate-700">{COLUMN_LABELS[key]}</span>
                        </button>
                    ))}
                    <div className="border-t border-slate-100 mt-1.5 pt-1.5 flex gap-2 px-2">
                        <button
                            onClick={() => onChange(Object.fromEntries(Object.keys(COLUMN_LABELS).map(k => [k, true])) as Record<ColumnKey, boolean>)}
                            className="text-[11px] text-blue-600 font-medium hover:underline"
                        >
                            Show all
                        </button>
                        <button
                            onClick={() => onChange(DEFAULT_VISIBLE_COLUMNS)}
                            className="text-[11px] text-slate-500 font-medium hover:underline"
                        >
                            Reset
                        </button>
                    </div>
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
    const [sortField, setSortField] = useState<SortField>(() => {
        if (typeof window !== 'undefined') {
            const saved = sessionStorage.getItem('companies_sortField');
            return saved ? (saved as SortField) : 'id';
        }
        return 'id';
    });

    const [sortDirection, setSortDirection] = useState<SortDirection>(() => {
        if (typeof window !== 'undefined') {
            const saved = sessionStorage.getItem('companies_sortDirection');
            return saved ? (saved as SortDirection) : 'asc';
        }
        return 'asc';
    });

    const [debouncedSearch, setDebouncedSearch] = useState(() => {
        if (typeof window !== 'undefined') {
            return sessionStorage.getItem(GLOBAL_SEARCH_STORAGE_KEY) || '';
        }
        return '';
    });

    const defaultColumnFilters = {
        id: '',
        name: '',
        status: [] as string[],
        discipline: [] as string[],
        targetSponsorshipTier: [] as string[],
        assignedTo: [] as string[],
        contact: '',
        emails: '',
        phones: ''
    };
    const [columnFilters, setColumnFilters] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = sessionStorage.getItem('companies_columnFilters');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    return { ...defaultColumnFilters, ...parsed };
                } catch { /* ignore */ }
            }
        }
        return defaultColumnFilters;
    });

    const [copiedCell, setCopiedCell] = useState<{ companyId: string; field: 'emails' | 'phones' } | null>(null);

    const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('companies_visibleColumns');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    // Merge with defaults so new columns are shown by default
                    return { ...DEFAULT_VISIBLE_COLUMNS, ...parsed };
                } catch { /* ignore */ }
            }
        }
        return DEFAULT_VISIBLE_COLUMNS;
    });

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('companies_visibleColumns', JSON.stringify(visibleColumns));
        }
    }, [visibleColumns]);

    useEffect(() => {
        if (!copiedCell) return;
        const t = setTimeout(() => setCopiedCell(null), 2000);
        return () => clearTimeout(t);
    }, [copiedCell]);

    const handleCopyEmails = (e: React.MouseEvent, company: Company) => {
        e.stopPropagation();
        const emails = (company.email || '').trim();
        if (!emails) return;
        navigator.clipboard.writeText(emails).then(() => setCopiedCell({ companyId: company.id, field: 'emails' })).catch(() => {});
    };

    const handleCopyPhones = (e: React.MouseEvent, company: Company) => {
        e.stopPropagation();
        const phones = (company.phone || '').trim();
        if (!phones) return;
        navigator.clipboard.writeText(phones).then(() => setCopiedCell({ companyId: company.id, field: 'phones' })).catch(() => {});
    };

    useEffect(() => {
        if (typeof window !== 'undefined') {
            sessionStorage.setItem('companies_sortField', sortField);
            sessionStorage.setItem('companies_sortDirection', sortDirection);
            sessionStorage.setItem('companies_columnFilters', JSON.stringify(columnFilters));
            sessionStorage.setItem(GLOBAL_SEARCH_STORAGE_KEY, debouncedSearch);
        }
    }, [sortField, sortDirection, columnFilters, debouncedSearch]);

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

    const idGapInfo = useMemo(() => {
        if (companies.length === 0) return null;
        const ids = companies.map(c => {
            const match = c.id.match(/ME-(\d+)/);
            return match ? parseInt(match[1], 10) : 0;
        }).filter(id => id > 0).sort((a, b) => a - b);
        if (ids.length === 0) return null;
        const minId = ids[0];
        const maxId = ids[ids.length - 1];
        const gapCount = (maxId - minId + 1) - ids.length;
        return gapCount > 0 ? { minId, maxId, gapCount } : null;
    }, [companies]);

    // Precompute one normalised search string per company so the filter loop only does includes()
    const companySearchStrings = useMemo(() =>
        companies.map(c => normalise([
            c.id,
            c.name,
            c.status,
            c.discipline || '',
            c.targetSponsorshipTier || '',
            c.contact,
            c.email,
            c.phone || '',
            c.assignedTo,
            c.scheduledDate || '',
            c.scheduledTime || '',
        ].join(' '))),
        [companies]
    );

    const filteredAndSortedCompanies = useMemo(() => {
        const searchNorm = normalise(debouncedSearch.trim());

        let result = companies.filter((company, i) => {
            if (searchNorm && !companySearchStrings[i].includes(searchNorm)) return false;

            // Per-column text filters: accent-insensitive (same as global search)
            const matchesId = !columnFilters.id.trim() || normalise(company.id).includes(normalise(columnFilters.id));
            const matchesName = !columnFilters.name.trim() || normalise(company.name).includes(normalise(columnFilters.name));
            const matchesStatus = columnFilters.status.length === 0 || columnFilters.status.includes(company.status);
            const companyDisciplines = company.discipline ? company.discipline.split(',').map((d: string) => d.trim()).filter(Boolean) : [];
            const matchesDiscipline = columnFilters.discipline.length === 0 || columnFilters.discipline.some((d: string) => companyDisciplines.includes(d));
            const matchesTier = columnFilters.targetSponsorshipTier.length === 0 || (company.targetSponsorshipTier && columnFilters.targetSponsorshipTier.includes(company.targetSponsorshipTier));
            const matchesAssignee = columnFilters.assignedTo.length === 0 || columnFilters.assignedTo.includes(company.assignedTo);
            const matchesContact =
                !columnFilters.contact.trim() ||
                normalise(company.contact).includes(normalise(columnFilters.contact)) ||
                normalise(company.email).includes(normalise(columnFilters.contact));
            const matchesEmails = !columnFilters.emails.trim() || normalise(company.email).includes(normalise(columnFilters.emails));
            const matchesPhones = !columnFilters.phones.trim() || normalise(company.phone || '').includes(normalise(columnFilters.phones));

            return matchesId && matchesName && matchesStatus && matchesDiscipline && matchesTier && matchesAssignee && matchesContact && matchesEmails && matchesPhones;
        });

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
            return sortDirection === 'asc' ? (aValue > bValue ? 1 : -1) : (aValue < bValue ? 1 : -1);
        });

        return result;
    }, [companies, companySearchStrings, debouncedSearch, columnFilters, sortField, sortDirection]);

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
            'To Follow Up': 'bg-amber-100 text-amber-700',
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

    const handleCheckboxClick = (companyId: string, index: number, event: React.MouseEvent) => {
        const newSelected = new Set(selectedCompanies);
        if (event.shiftKey && lastSelectedIndex !== null && filteredAndSortedCompanies) {
            const start = Math.min(lastSelectedIndex as number, index);
            const end = Math.max(lastSelectedIndex as number, index);
            for (let i = start; i <= end; i++) {
                if (filteredAndSortedCompanies[i]) newSelected.add(filteredAndSortedCompanies[i].id);
            }
        } else {
            if (newSelected.has(companyId)) {
                newSelected.delete(companyId);
            } else {
                newSelected.add(companyId);
            }
        }
        onSelectionChange(newSelected);
        onLastSelectedIndexChange(index);
    };

    const handleSelectAll = () => onSelectionChange(new Set(filteredAndSortedCompanies.map(c => c.id)));
    const handleClearSelection = () => { onSelectionChange(new Set()); onLastSelectedIndexChange(null); };

    const formatDate = (dateString: string) => {
        if (!dateString) return '';
        return new Date(dateString).toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
        });
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <ArrowsUpDownIcon className="w-4 h-4 text-slate-400" />;
        return sortDirection === 'asc'
            ? <ChevronUpIcon className="w-4 h-4 text-blue-600" />
            : <ChevronDownIcon className="w-4 h-4 text-blue-600" />;
    };

    const hasColumnFilters = !!(columnFilters.id || columnFilters.name || columnFilters.status.length > 0 ||
        columnFilters.discipline.length > 0 || columnFilters.targetSponsorshipTier.length > 0 ||
        columnFilters.assignedTo.length > 0 || columnFilters.contact || columnFilters.emails || columnFilters.phones);
    const hasAnyFilter = !!debouncedSearch || hasColumnFilters;

    const clearAllFilters = () => {
        setDebouncedSearch('');
        if (typeof window !== 'undefined') sessionStorage.setItem(GLOBAL_SEARCH_STORAGE_KEY, '');
        setColumnFilters({ id: '', name: '', status: [], discipline: [], targetSponsorshipTier: [], assignedTo: [], contact: '', emails: '', phones: '' });
    };

    // Dynamic column count for colSpan
    const visibleColCount = 2 + Object.values(visibleColumns).filter(Boolean).length; // 2 = select + name (always visible)

    const col = visibleColumns;

    return (
        <div className="space-y-4">
            {/* Header card */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                {/* Top row: title + column picker */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                        <div>
                            <h2 className="text-xl font-bold text-slate-900">All Companies</h2>
                            <div className="flex items-center gap-2 mt-0.5">
                                {filteredAndSortedCompanies.length !== companies.length ? (
                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 font-medium text-xs">
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                        {filteredAndSortedCompanies.length} of {companies.length} results
                                    </span>
                                ) : (
                                    <p className="text-sm text-slate-500">{companies.length} companies total</p>
                                )}
                                {idGapInfo && (
                                    <span
                                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium text-xs"
                                        title={`${idGapInfo.gapCount} ID${idGapInfo.gapCount > 1 ? 's' : ''} missing between ME-${String(idGapInfo.minId).padStart(4, '0')} and ME-${String(idGapInfo.maxId).padStart(4, '0')}`}
                                    >
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                        {idGapInfo.gapCount} ID gap{idGapInfo.gapCount > 1 ? 's' : ''}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={clearAllFilters}
                            disabled={!hasAnyFilter}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${hasAnyFilter
                                ? 'bg-white border-slate-200 text-slate-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600'
                                : 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
                            }`}
                        >
                            <XMarkIcon className="w-4 h-4" />
                            Clear filters
                            {hasAnyFilter && (
                                <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-semibold leading-none">
                                    {(debouncedSearch ? 1 : 0) + (hasColumnFilters ? 1 : 0)}
                                </span>
                            )}
                        </button>
                        <ColumnPicker visibleColumns={visibleColumns} onChange={setVisibleColumns} />
                    </div>
                </div>

                {/* Global search bar — applies on Enter so typing stays smooth */}
                <GlobalSearchInput
                    appliedValue={debouncedSearch}
                    onApply={setDebouncedSearch}
                    placeholder="Search anything — press Enter to search"
                    className="w-full pl-9 pr-9 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50 placeholder:text-slate-400"
                />
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div
                    className="overflow-y-auto max-h-[calc(100vh-320px)]"
                    style={{ scrollbarGutter: 'stable' }}
                >
                    <table className="w-full text-left text-sm" style={{ tableLayout: 'fixed' }}>
                        <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                            <tr>
                                {/* Select (always visible) — large hit area for touch/accessibility */}
                                <th className="px-4 py-3 text-xs font-medium text-slate-600 tracking-wider bg-slate-50 align-middle" style={{ width: COLUMN_WIDTHS.select, minWidth: 44, minHeight: 44 }}>
                                    <label className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] -m-2 rounded hover:bg-slate-100 transition-colors cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={selectedCompanies.size > 0 && selectedCompanies.size === filteredAndSortedCompanies.length}
                                            onChange={e => e.target.checked ? handleSelectAll() : handleClearSelection()}
                                            className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                                            title="Select All"
                                            aria-label="Select all companies"
                                        />
                                    </label>
                                </th>
                                {/* ID */}
                                {col.id && (
                                    <th className="px-6 py-3 text-xs font-medium text-slate-600 tracking-wider bg-slate-50 whitespace-nowrap" style={{ width: COLUMN_WIDTHS.id }}>
                                        <button onClick={() => handleSort('id')} className="flex items-center gap-2 hover:text-slate-900 transition-colors">
                                            ID <SortIcon field="id" />
                                        </button>
                                    </th>
                                )}
                                {/* Name (always visible) */}
                                <th className="px-6 py-3 text-xs font-medium text-slate-600 tracking-wider bg-slate-50 whitespace-nowrap" style={{ width: COLUMN_WIDTHS.name }}>
                                    <button onClick={() => handleSort('name')} className="flex items-center gap-2 hover:text-slate-900 transition-colors">
                                        Company Name <SortIcon field="name" />
                                    </button>
                                </th>
                                {col.status && (
                                    <th className="px-6 py-3 text-xs font-medium text-slate-600 tracking-wider bg-slate-50 whitespace-nowrap" style={{ width: COLUMN_WIDTHS.status }}>
                                        <button onClick={() => handleSort('status')} className="flex items-center gap-2 hover:text-slate-900 transition-colors">
                                            Status <SortIcon field="status" />
                                        </button>
                                    </th>
                                )}
                                {col.discipline && (
                                    <th className="px-6 py-3 text-xs font-medium text-slate-600 tracking-wider bg-slate-50 whitespace-nowrap" style={{ width: COLUMN_WIDTHS.discipline }}>
                                        <span>Discipline</span>
                                    </th>
                                )}
                                {col.targetTier && (
                                    <th className="px-6 py-3 text-xs font-medium text-slate-600 tracking-wider bg-slate-50 whitespace-nowrap" style={{ width: COLUMN_WIDTHS.targetTier }}>
                                        <button onClick={() => handleSort('targetSponsorshipTier')} className="flex items-center gap-2 hover:text-slate-900 transition-colors">
                                            Target Tier <SortIcon field="targetSponsorshipTier" />
                                        </button>
                                    </th>
                                )}
                                {col.contact && (
                                    <th className="px-6 py-3 text-xs font-medium text-slate-600 tracking-wider bg-slate-50 whitespace-nowrap" style={{ width: COLUMN_WIDTHS.contact }}>
                                        <span>Contact Person</span>
                                    </th>
                                )}
                                {col.emails && (
                                    <th className="px-6 py-3 text-xs font-medium text-slate-600 tracking-wider bg-slate-50 whitespace-nowrap" style={{ width: COLUMN_WIDTHS.emails }}>
                                        <span>Emails</span>
                                    </th>
                                )}
                                {col.phones && (
                                    <th className="px-6 py-3 text-xs font-medium text-slate-600 tracking-wider bg-slate-50 whitespace-nowrap" style={{ width: COLUMN_WIDTHS.phones }}>
                                        <span>Phones</span>
                                    </th>
                                )}
                                {col.assignedTo && (
                                    <th className="px-6 py-3 text-xs font-medium text-slate-600 tracking-wider bg-slate-50 whitespace-nowrap" style={{ width: COLUMN_WIDTHS.assignedTo }}>
                                        <button onClick={() => handleSort('assignedTo')} className="flex items-center gap-2 hover:text-slate-900 transition-colors">
                                            Assigned To <SortIcon field="assignedTo" />
                                        </button>
                                    </th>
                                )}
                                {col.scheduled && (
                                    <th className="px-6 py-3 text-xs font-medium text-slate-600 tracking-wider bg-slate-50 whitespace-nowrap" style={{ width: COLUMN_WIDTHS.scheduled }}>
                                        <span>Scheduled</span>
                                    </th>
                                )}
                                {col.lastUpdated && (
                                    <th className="px-6 py-3 text-xs font-medium text-slate-600 tracking-wider bg-slate-50 whitespace-nowrap" style={{ width: COLUMN_WIDTHS.lastUpdated }}>
                                        <button onClick={() => handleSort('lastUpdated')} className="flex items-center gap-2 hover:text-slate-900 transition-colors">
                                            Last Updated <SortIcon field="lastUpdated" />
                                        </button>
                                    </th>
                                )}
                                {col.followUps && (
                                    <th className="px-6 py-3 text-xs font-medium text-slate-600 tracking-wider bg-slate-50 whitespace-nowrap" style={{ width: COLUMN_WIDTHS.followUps }}>
                                        <button onClick={() => handleSort('followUpsCompleted')} className="flex items-center gap-2 hover:text-slate-900 transition-colors">
                                            Follow Ups <SortIcon field="followUpsCompleted" />
                                        </button>
                                    </th>
                                )}
                            </tr>

                            {/* Per-column filter row */}
                            <tr className="bg-white border-b border-slate-200">
                                <th className="px-4 py-2 bg-white" style={{ width: COLUMN_WIDTHS.select }} />
                                {col.id && (
                                    <th className="px-6 py-2 bg-white" style={{ width: COLUMN_WIDTHS.id }}>
                                        <input
                                            type="text"
                                            value={columnFilters.id}
                                            onChange={e => setColumnFilters({ ...columnFilters, id: e.target.value })}
                                            placeholder="Filter…"
                                            className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        />
                                    </th>
                                )}
                                {/* Name filter (always visible) */}
                                <th className="px-6 py-2 bg-white" style={{ width: COLUMN_WIDTHS.name }}>
                                    <input
                                        type="text"
                                        value={columnFilters.name}
                                        onChange={e => setColumnFilters({ ...columnFilters, name: e.target.value })}
                                        placeholder="Filter…"
                                        className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                </th>
                                {col.status && (
                                    <th className="px-6 py-2 bg-white" style={{ width: COLUMN_WIDTHS.status }}>
                                        <FilterRowMultiSelect options={statuses} selected={columnFilters.status} onChange={s => setColumnFilters({ ...columnFilters, status: s })} />
                                    </th>
                                )}
                                {col.discipline && (
                                    <th className="px-6 py-2 bg-white" style={{ width: COLUMN_WIDTHS.discipline }}>
                                        <FilterRowMultiSelect options={disciplines} selected={columnFilters.discipline} onChange={s => setColumnFilters({ ...columnFilters, discipline: s })} />
                                    </th>
                                )}
                                {col.targetTier && (
                                    <th className="px-6 py-2 bg-white" style={{ width: COLUMN_WIDTHS.targetTier }}>
                                        <FilterRowMultiSelect options={targetTiers} selected={columnFilters.targetSponsorshipTier} onChange={s => setColumnFilters({ ...columnFilters, targetSponsorshipTier: s })} />
                                    </th>
                                )}
                                {col.contact && (
                                    <th className="px-6 py-2 bg-white" style={{ width: COLUMN_WIDTHS.contact }}>
                                        <input
                                            type="text"
                                            value={columnFilters.contact}
                                            onChange={e => setColumnFilters({ ...columnFilters, contact: e.target.value })}
                                            placeholder="Filter…"
                                            className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        />
                                    </th>
                                )}
                                {col.emails && (
                                    <th className="px-6 py-2 bg-white" style={{ width: COLUMN_WIDTHS.emails }}>
                                        <input
                                            type="text"
                                            value={columnFilters.emails}
                                            onChange={e => setColumnFilters({ ...columnFilters, emails: e.target.value })}
                                            placeholder="Filter…"
                                            className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        />
                                    </th>
                                )}
                                {col.phones && (
                                    <th className="px-6 py-2 bg-white" style={{ width: COLUMN_WIDTHS.phones }}>
                                        <input
                                            type="text"
                                            value={columnFilters.phones}
                                            onChange={e => setColumnFilters({ ...columnFilters, phones: e.target.value })}
                                            placeholder="Filter…"
                                            className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        />
                                    </th>
                                )}
                                {col.assignedTo && (
                                    <th className="px-6 py-2 bg-white" style={{ width: COLUMN_WIDTHS.assignedTo }}>
                                        <FilterRowMultiSelect options={assignees} selected={columnFilters.assignedTo} onChange={s => setColumnFilters({ ...columnFilters, assignedTo: s })} />
                                    </th>
                                )}
                                {col.scheduled && <th className="px-6 py-2 bg-white" style={{ width: COLUMN_WIDTHS.scheduled }} />}
                                {col.lastUpdated && <th className="px-6 py-2 bg-white" style={{ width: COLUMN_WIDTHS.lastUpdated }} />}
                                {col.followUps && <th className="px-6 py-2 bg-white" style={{ width: COLUMN_WIDTHS.followUps }} />}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredAndSortedCompanies.length === 0 ? (
                                <tr>
                                    <td colSpan={visibleColCount} className="px-6 py-12 text-center">
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
                                        <td
                                            className="px-4 py-4 align-middle cursor-pointer hover:bg-slate-100 transition-colors"
                                            style={{ width: COLUMN_WIDTHS.select, minWidth: 44, minHeight: 44 }}
                                            onClick={e => { e.stopPropagation(); handleCheckboxClick(company.id, index, e); }}
                                            role="button"
                                            tabIndex={0}
                                            onKeyDown={e => {
                                                if (e.key === ' ' || e.key === 'Enter') {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    handleCheckboxClick(company.id, index, e as unknown as React.MouseEvent);
                                                }
                                            }}
                                            aria-label={selectedCompanies.has(company.id) ? `Deselect ${company.name}` : `Select ${company.name}`}
                                            title={selectedCompanies.has(company.id) ? 'Deselect' : 'Select'}
                                        >
                                            <span className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] -m-2 rounded">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedCompanies.has(company.id)}
                                                    readOnly
                                                    tabIndex={-1}
                                                    aria-hidden
                                                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 pointer-events-none"
                                                />
                                            </span>
                                        </td>
                                        {col.id && (
                                            <td className="px-6 py-4 text-xs font-mono text-slate-500 whitespace-nowrap" style={{ width: COLUMN_WIDTHS.id }}>
                                                {company.id}
                                            </td>
                                        )}
                                        {/* Name (always visible) */}
                                        <td className="px-6 py-4" style={{ width: COLUMN_WIDTHS.name }}>
                                            <div className="flex items-center gap-2">
                                                {company.isFlagged && <FlagIcon className="w-4 h-4 text-red-500 flex-shrink-0" aria-label="Flagged" />}
                                                <span className="font-medium text-slate-900">{company.name}</span>
                                            </div>
                                        </td>
                                        {col.status && (
                                            <td className="px-6 py-4" style={{ width: COLUMN_WIDTHS.status }}>
                                                <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${getStatusColor(company.status)}`}>
                                                    {company.status}
                                                </span>
                                            </td>
                                        )}
                                        {col.discipline && (
                                            <td className="px-6 py-4" style={{ width: COLUMN_WIDTHS.discipline }}>
                                                <div className="flex flex-wrap gap-1">
                                                    {company.discipline ? company.discipline.split(',').map(d => {
                                                        const trimmed = d.trim();
                                                        if (!trimmed) return null;
                                                        return (
                                                            <span key={trimmed} className={`inline-flex px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase tracking-tight ${getDisciplineColor(trimmed)}`}>
                                                                {trimmed}
                                                            </span>
                                                        );
                                                    }) : <span className="text-slate-300 italic text-xs">N/A</span>}
                                                </div>
                                            </td>
                                        )}
                                        {col.targetTier && (
                                            <td className="px-6 py-4" style={{ width: COLUMN_WIDTHS.targetTier }}>
                                                <span className="text-slate-700">{company.targetSponsorshipTier || 'N/A'}</span>
                                            </td>
                                        )}
                                        {col.contact && (
                                            <td className="px-6 py-4 text-slate-700 font-medium" style={{ width: COLUMN_WIDTHS.contact }}>
                                                {company.contact || '—'}
                                            </td>
                                        )}
                                        {col.emails && (
                                            <td
                                                className={`relative px-6 py-4 text-slate-700 text-xs align-top ${company.email?.trim() ? 'cursor-pointer hover:text-blue-600 hover:bg-blue-50/50' : ''}`}
                                                style={{
                                                    width: COLUMN_WIDTHS.emails,
                                                    minWidth: COLUMN_WIDTHS.emails,
                                                    ...(company.email?.trim() ? { minHeight: '4.5rem' } : {}),
                                                }}
                                                onClick={e => handleCopyEmails(e, company)}
                                                title={company.email?.trim() ? 'Click to copy all emails' : ''}
                                            >
                                                {company.email?.trim() && copiedCell?.companyId === company.id && copiedCell?.field === 'emails' && (
                                                    <span className="absolute top-1/2 -translate-y-1/2 right-2 z-10 text-xs text-green-600 font-medium bg-white/95 px-1.5 py-0.5 rounded shadow-sm ring-1 ring-green-200" aria-live="polite">
                                                        Copied!
                                                    </span>
                                                )}
                                                <div className="flex items-start gap-2 min-w-0 overflow-hidden">
                                                    <span
                                                        className="min-w-0 flex-1 break-words line-clamp-3"
                                                        title={company.email?.trim() || undefined}
                                                    >
                                                        {company.email?.trim() ? company.email : <span className="text-slate-300">—</span>}
                                                    </span>
                                                    {company.email?.trim() && (
                                                        <ClipboardDocumentIcon className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" aria-hidden />
                                                    )}
                                                </div>
                                            </td>
                                        )}
                                        {col.phones && (
                                            <td
                                                className={`relative px-6 py-4 text-slate-700 text-xs ${company.phone?.trim() ? 'cursor-pointer hover:text-blue-600 hover:bg-blue-50/50' : ''}`}
                                                style={{ width: COLUMN_WIDTHS.phones, minWidth: COLUMN_WIDTHS.phones }}
                                                onClick={e => handleCopyPhones(e, company)}
                                                title={company.phone?.trim() ? 'Click to copy all phone numbers' : ''}
                                            >
                                                {company.phone?.trim() && copiedCell?.companyId === company.id && copiedCell?.field === 'phones' && (
                                                    <span className="absolute top-1/2 -translate-y-1/2 right-2 z-10 text-xs text-green-600 font-medium bg-white/95 px-1.5 py-0.5 rounded shadow-sm ring-1 ring-green-200" aria-live="polite">
                                                        Copied!
                                                    </span>
                                                )}
                                                <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                                                    <span className="min-w-0 truncate block" title={company.phone?.trim() || undefined}>
                                                        {company.phone?.trim() ? company.phone : <span className="text-slate-300">—</span>}
                                                    </span>
                                                    {company.phone?.trim() && (
                                                        <ClipboardDocumentIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden />
                                                    )}
                                                </div>
                                            </td>
                                        )}
                                        {col.assignedTo && (
                                            <td className="px-6 py-4 text-slate-700" style={{ width: COLUMN_WIDTHS.assignedTo }}>
                                                {company.assignedTo}
                                            </td>
                                        )}
                                        {col.scheduled && (
                                            <td className="px-6 py-4 text-slate-600 text-xs whitespace-nowrap" style={{ width: COLUMN_WIDTHS.scheduled }}>
                                                {company.scheduledDate && company.scheduledTime ? (
                                                    <span>
                                                        {new Date(company.scheduledDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, {formatTime(company.scheduledTime)}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-300">—</span>
                                                )}
                                            </td>
                                        )}
                                        {col.lastUpdated && (
                                            <td className="px-6 py-4 text-slate-600 whitespace-nowrap" style={{ width: COLUMN_WIDTHS.lastUpdated }}>
                                                {formatDate(company.lastUpdated)}
                                            </td>
                                        )}
                                        {col.followUps && (
                                            <td className="px-6 py-4 text-center" style={{ width: COLUMN_WIDTHS.followUps }}>
                                                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-50 text-blue-700 font-semibold text-xs border border-blue-100">
                                                    {company.followUpsCompleted || 0}
                                                </span>
                                            </td>
                                        )}
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
