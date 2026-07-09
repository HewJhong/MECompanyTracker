import Layout from '../components/Layout';
import { dynamicPageContent } from '../lib/dynamic-page-content';

const CompaniesBoard = dynamicPageContent(
    () => import('../components/CompaniesBoard'),
    'Loading company database…',
);

export default function CompaniesPage() {
    return (
        <Layout title="All Companies | Outreach Tracker">
            <CompaniesBoard />
        </Layout>
    );
}
