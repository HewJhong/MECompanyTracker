import Layout from '../components/Layout';
import { UserCircleIcon } from '@heroicons/react/24/outline';
import { dynamicPageContent } from '../lib/dynamic-page-content';

const CommitteeBoard = dynamicPageContent(
    () => import('../components/CommitteeBoard'),
    'Loading workspace…',
);

export default function CommitteePage() {
    return (
        <Layout title="My Workspace | Outreach Tracker">
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
            <CommitteeBoard />
        </Layout>
    );
}
