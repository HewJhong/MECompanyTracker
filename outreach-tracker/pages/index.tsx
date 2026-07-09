import { useSession } from 'next-auth/react';
import Layout from '../components/Layout';
import LandingPage from '../components/LandingPage';
import PageContentLoader from '../components/PageContentLoader';
import { DashboardSkeleton } from '../components/PageSkeletons';
import { dynamicPageContent } from '../lib/dynamic-page-content';

const DashboardBoard = dynamicPageContent(
    () => import('../components/DashboardBoard'),
    'Loading command center…',
    DashboardSkeleton,
);

export default function Home() {
    const { data: session, status: authStatus } = useSession();

    if (authStatus === 'loading') {
        return <PageContentLoader fullScreen label="Loading…" />;
    }

    if (!session) {
        return <LandingPage />;
    }

    return (
        <Layout title="Command Center | Outreach Tracker">
            <DashboardBoard />
        </Layout>
    );
}
