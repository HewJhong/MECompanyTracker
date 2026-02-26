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
    lastCompanyActivity?: string;
    previousResponse?: string;
}

export default function CommitteePage() {
    const router = useRouter();
    const { user, loading: userLoading } = useCurrentUser();
    const [data, setData] = useState<Company[]>([]);
    const [loading, setLoading] = useState(true);

    // Redirect to home if not authenticated
    useEffect(() => {
        if (!userLoading && !user) {
            router.push('/');
        }
    }, [userLoading, user, router]);

    const currentUser = user?.name ?? '';

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

        // Warning Logic: Company Replied > Committee Contact > 3 Days
        const replyNeeded = (() => {
            if (!company.previousResponse) return false;

            const lastCommitteeContactDate = company.lastCompanyActivity ? new Date(company.lastCompanyActivity).getTime() : 0;
            const lastCompanyReplyDate = new Date(company.previousResponse).getTime();

            const daysSinceReply = (Date.now() - lastCompanyReplyDate) / (1000 * 60 * 60 * 24);

            return (lastCompanyReplyDate > lastCommitteeContactDate) && (daysSinceReply > 3);
        })();

        const activeContact = company.contacts?.find((c: any) => c.isActive) || company.contacts?.[0];

        return {
            id: company.id,
            name: company.companyName || company.name || '',
            status: company.status,
            contact: activeContact?.name || '',
            email: activeContact?.email || '',
            lastUpdated: company.lastUpdated || '',
            isFlagged: company.isFlagged,
            isStale: daysSinceUpdate > 7,
            replyNeeded
        };
    });

    const handleCompanyClick = (companyId: string) => {
        router.push(`/companies/${encodeURIComponent(companyId)}`);
    };

    if (loading || userLoading) {
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


            {user && !user.isCommitteeMember && (
                <div className="mb-6 p-6 bg-amber-50 border border-amber-200 rounded-xl">
                    <h3 className="text-lg font-semibold text-amber-900 mb-2">Committee Workspace Not Available</h3>
                    <p className="text-amber-800">
                        You are signed in as <strong>{user.name || user.email}</strong>, but you don't have access to the committee workspace.
                    </p>
                    <p className="text-amber-700 mt-2 text-sm">
                        This page is only available for committee members. If you believe this is an error, please contact the administrator.
                    </p>
                </div>
            )}


            {/* Workspace Content */}
            {user?.isCommitteeMember && (
                <CommitteeWorkspace
                    companies={transformedCompanies}
                    memberName={currentUser}
                    onCompanyClick={handleCompanyClick}
                />
            )}
        </Layout>
    );
}
