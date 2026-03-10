import type { NextApiRequest, NextApiResponse } from 'next';
import {
    getNextAvailableStartTime,
    getEmailScheduleSettings,
    computeTimeSlotsWithExisting,
} from '../../../lib/email-schedule';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { date, count, startTime } = req.query;

        if (!date || typeof date !== 'string') {
            return res.status(400).json({ error: 'date query parameter is required (YYYY-MM-DD)' });
        }

        const [nextStartTime, settings] = await Promise.all([
            getNextAvailableStartTime(date),
            getEmailScheduleSettings(),
        ]);

        const countNum = typeof count === 'string' ? parseInt(count, 10) : undefined;
        const startTimeStr = typeof startTime === 'string' ? startTime : undefined;
        const useStart = startTimeStr ?? nextStartTime;

        let slots: string[] | undefined;
        if (countNum !== undefined && countNum > 0) {
            const result = await computeTimeSlotsWithExisting(date, useStart, countNum);
            slots = result.slots;
        }

        return res.status(200).json({
            date,
            nextStartTime,
            ...(slots !== undefined && { slots }),
            settings: {
                emailsPerBatch: settings.emailsPerBatch,
                batchIntervalMinutes: settings.batchIntervalMinutes,
                blockedPeriods: settings.blockedPeriods,
                defaultStartTime: settings.defaultStartTime,
            },
        });
    } catch (error) {
        console.error('Available slots API error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}
