import Layout from '../components/Layout';
import AdminRoute from '../components/AdminRoute';
import { Cog6ToothIcon } from '@heroicons/react/24/solid';
import { dynamicPageContent } from '../lib/dynamic-page-content';

const SettingsBoard = dynamicPageContent(
    () => import('../components/SettingsBoard'),
    'Loading settings…',
);

export default function SettingsPage() {
    return (
        <AdminRoute>
            <Layout title="Settings | Outreach Tracker">
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-gradient-to-br from-slate-500 to-slate-700 rounded-xl">
                            <Cog6ToothIcon className="w-6 h-6 text-white" aria-hidden="true" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-slate-900">Settings</h1>
                            <p className="text-slate-600 mt-1">Manage your account and preferences</p>
                        </div>
                    </div>
                </div>
                <SettingsBoard />
            </Layout>
        </AdminRoute>
    );
}
