import Layout from '../../components/Layout';
import { dynamicPageContent } from '../../lib/dynamic-page-content';

const CompanyDetailBoard = dynamicPageContent(
    () => import('../../components/CompanyDetailBoard'),
    'Loading company…',
);

export default function CompanyDetailPage() {
    return (
        <Layout title="Company | Outreach Tracker">
            <CompanyDetailBoard />
        </Layout>
    );
}
