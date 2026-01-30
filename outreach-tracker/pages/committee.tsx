import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import CommitteeWorkspace from '../components/CommitteeWorkspace';
import { UserCircleIcon } from '@heroicons/react/24/outline';
import { useCurrentUser } from '../contexts/CurrentUserContext';

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

export default function CommitteePage() {
    const router = useRouter();
    const { user } = useCurrentUser();
    const [data, setData] = useState<Company[]>([]);
    const [loading, setLoading] = useState(true);

    const currentUser = user?.name ?? 'Anonymous';

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

    // Filter companies assigned to current user
    const myCompanies = data.filter(c => c.pic === currentUser);

    // Transform data for CommitteeWorkspace component
    const transformedCompanies = myCompanies.map(company => {
        const daysSinceUpdate = company.lastUpdated
            ? (Date.now() - new Date(company.lastUpdated).getTime()) / (1000 * 60 * 60 * 24)
            : 0;

        return {
            id: company.id,
            name: company.companyName || company.name || '',
            status: company.status,
            contact: company.contacts?.[0]?.picName || '',
            email: company.contacts?.[0]?.email || '',
            lastUpdated: company.lastUpdated || '',
            isFlagged: company.isFlagged,
            isStale: daysSinceUpdate > 7
        };
    });

    const handleCompanyClick = (companyId: string) => {
        router.push(`/companies/${encodeURIComponent(companyId)}`);
    };

    if (loading) {
        return (
            <Layout title="My Workspace | Outreach Tracker">
                <div className="flex flex-col items-center justify-center h-96">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mb-4"></div>
                    <p className="text-slate-600 font-medium">Loading workspace...</p>
                </div>
            </Layout>
        );
    }

    return (
        <Layout title="My Workspace | Outreach Tracker">
            {/* Page Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl">
                        <UserCircleIcon className="w-6 h-6 text-white" aria-hidden="true" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">Committee Workspace</h1>
                        <p className="text-slate-600 mt-1">Manage your assigned companies and track progress</p>
                    </div>
                </div>
            </div>

            {!currentUser && (
                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
                    <p className="font-medium">No user set — assignments are filtered by your name.</p>
                    <p className="mt-1 text-amber-700">
                        Set <code className="bg-amber-100 px-1 rounded">NEXT_PUBLIC_CURRENT_USER_NAME</code> in your environment, or configure your profile in Settings. Once auth is deployed, this will use your signed-in identity.
                    </p>
                </div>
            )}

            {/* Workspace Content */}
            <CommitteeWorkspace
                companies={transformedCompanies}
                memberName={currentUser}
                onCompanyClick={handleCompanyClick}
            />
        </Layout>
    );
}
