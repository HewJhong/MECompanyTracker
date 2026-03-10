import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/auth';
import { getCommitteeMembers } from '../../../lib/committee-members';
import { getEmailScheduleSettings, saveEmailScheduleSettings } from '../../../lib/email-schedule';
import { ScheduleSettings } from '../../../lib/schedule-calculator';

async function requireAdmin(req: NextApiRequest, res: NextApiResponse): Promise<boolean> {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.email) {
        res.status(401).json({ error: 'Unauthorized' });
        return false;
    }
    const members = await getCommitteeMembers();
    const user = members.find(m => m.email.toLowerCase().trim() === session.user!.email!.toLowerCase().trim());
    if (!user || user.role?.toLowerCase() !== 'admin') {
        res.status(403).json({ error: 'Admin access required' });
        return false;
    }
    return true;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        if (req.method === 'GET') {
            const settings = await getEmailScheduleSettings();
            return res.status(200).json({ settings });
        }

        if (req.method === 'POST') {
            const isAdmin = await requireAdmin(req, res);
            if (!isAdmin) return;

            const { settings } = req.body as { settings: ScheduleSettings };

            if (!settings) {
                return res.status(400).json({ error: 'settings payload is required' });
            }

            // Basic validation
            if (typeof settings.emailsPerBatch !== 'number' || settings.emailsPerBatch < 1) {
                return res.status(400).json({ error: 'emailsPerBatch must be a positive number' });
            }
            if (typeof settings.batchIntervalMinutes !== 'number' || settings.batchIntervalMinutes < 1) {
                return res.status(400).json({ error: 'batchIntervalMinutes must be a positive number' });
            }
            if (!settings.defaultStartTime || !/^\d{2}:\d{2}$/.test(settings.defaultStartTime)) {
                return res.status(400).json({ error: 'defaultStartTime must be in HH:mm format' });
            }
            if (!Array.isArray(settings.blockedPeriods)) {
                return res.status(400).json({ error: 'blockedPeriods must be an array' });
            }

            await saveEmailScheduleSettings(settings);

            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('Email schedule settings API error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}
