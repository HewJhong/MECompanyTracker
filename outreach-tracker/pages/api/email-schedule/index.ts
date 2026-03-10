import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/auth';
import { getCommitteeMembers } from '../../../lib/committee-members';
import {
    getEmailSchedule,
    saveEmailScheduleEntries,
    deleteEmailScheduleEntries,
    computeTimeSlotsWithExisting,
    EmailScheduleEntry,
} from '../../../lib/email-schedule';

async function requireAdmin(req: NextApiRequest, res: NextApiResponse): Promise<string | null> {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.email) {
        res.status(401).json({ error: 'Unauthorized' });
        return null;
    }
    const members = await getCommitteeMembers();
    const user = members.find(m => m.email.toLowerCase().trim() === session.user!.email!.toLowerCase().trim());
    if (!user || user.role?.toLowerCase() !== 'admin') {
        res.status(403).json({ error: 'Admin access required' });
        return null;
    }
    return session.user.name || session.user.email;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        if (req.method === 'GET') {
            const { date, pic } = req.query;
            let entries = await getEmailSchedule(typeof date === 'string' ? date : undefined);

            if (typeof pic === 'string') {
                entries = entries.filter(e => e.pic === pic);
            }

            return res.status(200).json({ entries });
        }

        if (req.method === 'POST') {
            const actorName = await requireAdmin(req, res);
            if (!actorName) return;

            const { companyIds, companyNames, pic, date, startTime } = req.body as {
                companyIds: string[];
                companyNames?: Record<string, string>;
                pic: string;
                date: string;
                startTime: string;
            };

            if (!Array.isArray(companyIds) || companyIds.length === 0) {
                return res.status(400).json({ error: 'companyIds must be a non-empty array' });
            }
            if (!pic || !date || !startTime) {
                return res.status(400).json({ error: 'pic, date, and startTime are required' });
            }

            const { slots } = await computeTimeSlotsWithExisting(date, startTime, companyIds.length);

            const now = new Date().toISOString();
            const entries: EmailScheduleEntry[] = companyIds.map((id, i) => ({
                companyId: id,
                companyName: companyNames?.[id] || id,
                pic,
                date,
                time: slots[i],
                order: i,
                createdAt: now,
                createdBy: actorName,
            }));

            await saveEmailScheduleEntries(entries);

            return res.status(200).json({ success: true, entries });
        }

        if (req.method === 'PUT') {
            const actorName = await requireAdmin(req, res);
            if (!actorName) return;

            const { entries } = req.body as {
                entries: Array<{ companyId: string; companyName?: string; pic: string; date: string; time: string; order?: number }>;
            };

            if (!Array.isArray(entries) || entries.length === 0) {
                return res.status(400).json({ error: 'entries must be a non-empty array' });
            }

            const now = new Date().toISOString();
            const toSave: EmailScheduleEntry[] = entries.map((e, i) => ({
                companyId: e.companyId,
                companyName: e.companyName || e.companyId,
                pic: e.pic,
                date: e.date,
                time: e.time,
                order: e.order ?? i,
                createdAt: now,
                createdBy: actorName,
            }));

            await saveEmailScheduleEntries(toSave);

            return res.status(200).json({ success: true, entries: toSave });
        }

        if (req.method === 'DELETE') {
            const actorName = await requireAdmin(req, res);
            if (!actorName) return;

            const { companyIds, date } = req.body as { companyIds: string[]; date: string };

            if (!Array.isArray(companyIds) || companyIds.length === 0) {
                return res.status(400).json({ error: 'companyIds must be a non-empty array' });
            }
            if (!date) {
                return res.status(400).json({ error: 'date is required' });
            }

            await deleteEmailScheduleEntries(companyIds, date);

            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('Email schedule API error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}
