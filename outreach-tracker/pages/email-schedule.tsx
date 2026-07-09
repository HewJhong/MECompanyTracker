import Layout from '../components/Layout';
import { EmailScheduleSkeleton } from '../components/PageSkeletons';
import { dynamicPageContent } from '../lib/dynamic-page-content';

const EmailScheduleBoard = dynamicPageContent(
    () => import('../components/EmailScheduleBoard'),
    'Loading schedule…',
    EmailScheduleSkeleton,
);

export default function EmailSchedulePage() {
    return (
        <Layout title="Email Schedule | Outreach Tracker">
            <EmailScheduleBoard />
        </Layout>
    );
}
