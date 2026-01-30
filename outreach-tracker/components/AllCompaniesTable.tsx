import React, { useState, useMemo } from 'react';
import {
    MagnifyingGlassIcon,
    FunnelIcon,
    ArrowsUpDownIcon,
    ChevronUpIcon,
    ChevronDownIcon,
    EyeIcon,
    FlagIcon
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
}

interface AllCompaniesTableProps {
    companies: Company[];
    onCompanyClick?: (companyId: string) => void;
}

type SortField = 'name' | 'status' | 'assignedTo' | 'lastUpdated';
type SortDirection = 'asc' | 'desc';

export default function AllCompaniesTable({ companies, onCompanyClick }: AllCompaniesTableProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
    const [sortField, setSortField] = useState<SortField>('lastUpdated');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    // Get unique statuses and assignees for filters
    const statuses = useMemo(() => 
        Array.from(new Set(companies.map(c => c.status))).sort(), 
        [companies]
    );
    const assignees = useMemo(() => 
        Array.from(new Set(companies.map(c => c.assignedTo))).sort(), 
        [companies]
    );

    // Filter and sort companies
    const filteredAndSortedCompanies = useMemo(() => {
        let result = companies.filter(company => {
            const matchesSearch = 
                company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                company.contact.toLowerCase().includes(searchTerm.toLowerCase()) ||
                company.email.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesStatus = statusFilter === 'all' || company.status === statusFilter;
            const matchesAssignee = assigneeFilter === 'all' || company.assignedTo === assigneeFilter;
            
            return matchesSearch && matchesStatus && matchesAssignee;
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
    }, [companies, searchTerm, statusFilter, assigneeFilter, sortField, sortDirection]);

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
            'Negotiating': 'bg-amber-100 text-amber-700',
            'Closed': 'bg-green-100 text-green-700',
            'Rejected': 'bg-red-100 text-red-700',
        };
        return colors[status] || 'bg-slate-100 text-slate-700';
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
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
            {/* Header & Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex flex-col gap-4">
                    {/* Title and Search */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h2 className="text-xl font-bold text-slate-900">All Companies</h2>
                            <p className="text-sm text-slate-600 mt-1">
                                Showing {filteredAndSortedCompanies.length} of {companies.length} companies
                            </p>
                        </div>
                        
                        {/* Search */}
                        <div className="relative w-full sm:w-96">
                            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" aria-hidden="true" />
                            <input
                                type="text"
                                placeholder="Search by name, contact, or email..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="flex flex-wrap items-center gap-3">
                        <FunnelIcon className="w-5 h-5 text-slate-400" aria-hidden="true" />
                        
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                            <option value="all">All Statuses</option>
                            {statuses.map(status => (
                                <option key={status} value={status}>{status}</option>
                            ))}
                        </select>

                        <select
                            value={assigneeFilter}
                            onChange={(e) => setAssigneeFilter(e.target.value)}
                            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                            <option value="all">All Assignees</option>
                            {assignees.map(assignee => (
                                <option key={assignee} value={assignee}>{assignee}</option>
                            ))}
                        </select>

                        {(searchTerm || statusFilter !== 'all' || assigneeFilter !== 'all') && (
                            <button
                                onClick={() => {
                                    setSearchTerm('');
                                    setStatusFilter('all');
                                    setAssigneeFilter('all');
                                }}
                                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                            >
                                Clear Filters
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-3 text-xs font-medium text-slate-600 uppercase tracking-wider">
                                    <button
                                        onClick={() => handleSort('name')}
                                        className="flex items-center gap-2 hover:text-slate-900 transition-colors"
                                    >
                                        Company Name
                                        <SortIcon field="name" />
                                    </button>
                                </th>
                                <th className="px-6 py-3 text-xs font-medium text-slate-600 uppercase tracking-wider">
                                    <button
                                        onClick={() => handleSort('status')}
                                        className="flex items-center gap-2 hover:text-slate-900 transition-colors"
                                    >
                                        Status
                                        <SortIcon field="status" />
                                    </button>
                                </th>
                                <th className="px-6 py-3 text-xs font-medium text-slate-600 uppercase tracking-wider">
                                    <button
                                        onClick={() => handleSort('assignedTo')}
                                        className="flex items-center gap-2 hover:text-slate-900 transition-colors"
                                    >
                                        Assigned To
                                        <SortIcon field="assignedTo" />
                                    </button>
                                </th>
                                <th className="px-6 py-3 text-xs font-medium text-slate-600 uppercase tracking-wider">
                                    Contact Person
                                </th>
                                <th className="px-6 py-3 text-xs font-medium text-slate-600 uppercase tracking-wider">
                                    <button
                                        onClick={() => handleSort('lastUpdated')}
                                        className="flex items-center gap-2 hover:text-slate-900 transition-colors"
                                    >
                                        Last Updated
                                        <SortIcon field="lastUpdated" />
                                    </button>
                                </th>
                                <th className="px-6 py-3 text-xs font-medium text-slate-600 uppercase tracking-wider">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredAndSortedCompanies.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center">
                                        <MagnifyingGlassIcon className="mx-auto w-12 h-12 text-slate-300 mb-3" />
                                        <p className="text-sm text-slate-600 font-medium">No companies found</p>
                                        <p className="text-xs text-slate-500 mt-1">Try adjusting your search or filters</p>
                                    </td>
                                </tr>
                            ) : (
                                filteredAndSortedCompanies.map(company => (
                                    <tr 
                                        key={company.id} 
                                        className="hover:bg-slate-50 transition-colors group"
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                {company.isFlagged && (
                                                    <FlagIcon className="w-4 h-4 text-red-500 flex-shrink-0" aria-label="Flagged" />
                                                )}
                                                <span className="font-medium text-slate-900">{company.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(company.status)}`}>
                                                {company.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-slate-700">
                                            {company.assignedTo}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-slate-700">{company.contact}</div>
                                            <div className="text-xs text-slate-500 mt-0.5">{company.email}</div>
                                        </td>
                                        <td className="px-6 py-4 text-slate-600">
                                            {formatDate(company.lastUpdated)}
                                        </td>
                                        <td className="px-6 py-4">
                                            <button
                                                onClick={() => onCompanyClick?.(company.id)}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                                            >
                                                <EyeIcon className="w-4 h-4" aria-hidden="true" />
                                                View
                                            </button>
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
