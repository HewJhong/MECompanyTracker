import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import AllCompaniesTable from '../components/AllCompaniesTable';
import { TableCellsIcon } from '@heroicons/react/24/outline';

interface Company {
    id: string;
    companyName: string;
    name?: string;
    status: string;
    isFlagged: boolean;
    contacts: any[];
    lastUpdated?: string;
    pic?: string;
    history?: any[];
    discipline?: string;
    priority?: string;
}

export default function CompaniesPage() {
    const router = useRouter();
    const [data, setData] = useState<Company[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        try {
            const res = await fetch('/api/data');
            const responseData = await res.json();
            setData(responseData.companies || []);
            setLoading(false);
        } catch (err) {
            console.error('Failed to load data', err);
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Transform data for AllCompaniesTable component
    const transformedCompanies = data.map(company => ({
        id: company.id,
        name: company.companyName || company.name || '',
        status: company.status,
        assignedTo: company.pic || 'Unassigned',
        contact: company.contacts?.[0]?.picName || '',
        email: company.contacts?.[0]?.email || '',
        lastUpdated: company.lastUpdated || '',
        isFlagged: company.isFlagged,
        discipline: company.discipline || ''
    }));

    const handleCompanyClick = (companyId: string) => {
        router.push(`/companies/${encodeURIComponent(companyId)}`);
    };

    if (loading) {
        return (
            <Layout title="All Companies | Outreach Tracker">
                <div className="flex flex-col items-center justify-center h-96">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mb-4"></div>
                    <p className="text-slate-600 font-medium">Loading companies...</p>
                </div>
            </Layout>
        );
    }

    return (
        <Layout title="All Companies | Outreach Tracker">
            {/* Page Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl">
                        <TableCellsIcon className="w-6 h-6 text-white" aria-hidden="true" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">All Companies</h1>
                        <p className="text-slate-600 mt-1">Browse and manage the complete company database</p>
                    </div>
                </div>
            </div>

            {/* Table Content */}
            <AllCompaniesTable
                companies={transformedCompanies}
                onCompanyClick={handleCompanyClick}
            />
        </Layout>
    );
}
