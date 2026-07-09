import Layout from '../components/Layout';
import { AnalyticsSkeleton } from '../components/PageSkeletons';
import { dynamicPageContent } from '../lib/dynamic-page-content';

const AnalyticsBoard = dynamicPageContent(
    () => import('../components/AnalyticsBoard'),
    'Loading analytics…',
    AnalyticsSkeleton,
);

export default function AnalyticsPage() {
    return (
        <Layout title="Analytics | Outreach Tracker">
            <AnalyticsBoard />
        </Layout>
    );
}
