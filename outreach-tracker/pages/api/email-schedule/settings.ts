import type { NextApiRequest, NextApiResponse } from 'next';
import { getEmailScheduleSettings, saveEmailScheduleSettings } from '../../../lib/email-schedule';
import { ScheduleSettings } from '../../../lib/schedule-calculator';
import { requireEffectiveAdmin } from '../../../lib/authz';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        if (req.method === 'GET') {
            const settings = await getEmailScheduleSettings();
            return res.status(200).json({ settings });
        }

        if (req.method === 'POST') {
            const ctx = await requireEffectiveAdmin(req, res);
            if (!ctx) return;

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
