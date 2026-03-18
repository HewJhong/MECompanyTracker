import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleSheetsClient } from '../../../lib/google-sheets';
import {
    getEmailSchedule,
    saveEmailScheduleEntries,
    deleteEmailScheduleEntries,
    computeTimeSlotsWithExisting,
    EmailScheduleEntry,
} from '../../../lib/email-schedule';
import { formatActorLabel, requireEffectiveAdmin } from '../../../lib/authz';

async function appendThreadHistory(
    rows: string[][],
) {
    if (rows.length === 0) return;
    try {
        const spreadsheetId = process.env.SPREADSHEET_ID_2;
        if (!spreadsheetId) return;
        const sheets = await getGoogleSheetsClient();
        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: 'Thread_History!A:D',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: rows },
        });
    } catch (err) {
        console.error('Failed to write email schedule action to Thread_History:', err);
    }
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
            const ctx = await requireEffectiveAdmin(req, res);
            if (!ctx) return;
            const actorName = formatActorLabel(ctx);

            const { companyIds, companyNames, pic, date, startTime, note } = req.body as {
                companyIds: string[];
                companyNames?: Record<string, string>;
                pic: string;
                date: string;
                startTime: string;
                note?: string;
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
                note: note?.trim() || undefined,
            }));

            await saveEmailScheduleEntries(entries);

            // Log to Thread_History: one row per company
            await appendThreadHistory(
                entries.map(e => [now, e.companyId, actorName, `Email schedule set for ${e.date} at ${e.time} (assigned to ${pic})`])
            );

            return res.status(200).json({ success: true, entries });
        }

        if (req.method === 'PUT') {
            const ctx = await requireEffectiveAdmin(req, res);
            if (!ctx) return;
            const actorName = formatActorLabel(ctx);

            const { entries } = req.body as {
                entries: Array<{ companyId: string; companyName?: string; pic: string; date: string; time: string; order?: number; note?: string; completed?: string }>;
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
                note: e.note?.trim() || undefined,
                completed: e.completed || undefined,
            }));

            await saveEmailScheduleEntries(toSave);

            // Log to Thread_History: one row per entry
            const nowPut = new Date().toISOString();
            await appendThreadHistory(
                toSave.map(e => [nowPut, e.companyId, actorName, `Email schedule updated to ${e.date} at ${e.time} (assigned to ${e.pic})`])
            );

            return res.status(200).json({ success: true, entries: toSave });
        }

        if (req.method === 'DELETE') {
            const ctx = await requireEffectiveAdmin(req, res);
            if (!ctx) return;
            const actorName = formatActorLabel(ctx);

            const { companyIds, date } = req.body as { companyIds: string[]; date: string };

            if (!Array.isArray(companyIds) || companyIds.length === 0) {
                return res.status(400).json({ error: 'companyIds must be a non-empty array' });
            }
            if (!date) {
                return res.status(400).json({ error: 'date is required' });
            }

            await deleteEmailScheduleEntries(companyIds, date);

            // Log to Thread_History: one row per company
            const nowDel = new Date().toISOString();
            await appendThreadHistory(
                companyIds.map(id => [nowDel, id, actorName, `Email schedule removed for ${date}`])
            );

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
