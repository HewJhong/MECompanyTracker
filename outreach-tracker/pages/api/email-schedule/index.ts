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

async function appendThreadHistory(rows: string[][]) {
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

async function appendLogsDoNotEdit(actorName: string, action: string, details: string, data: string) {
    try {
        const spreadsheetId = process.env.SPREADSHEET_ID_2;
        if (!spreadsheetId) return;
        const sheets = await getGoogleSheetsClient();
        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: 'Logs_DoNotEdit!A:E',
            valueInputOption: 'RAW',
            requestBody: {
                values: [[new Date().toISOString(), actorName, action, details, data]],
            },
        });
    } catch (err) {
        console.error('Failed to write email schedule action to Logs_DoNotEdit:', err);
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
            if (slots.length !== companyIds.length) {
                return res.status(400).json({
                    error: 'Schedule capacity exceeded',
                    code: 'SCHEDULE_CAPACITY_EXCEEDED',
                    date,
                    requestedEmails: companyIds.length,
                    maxEmailsAssignableFromStart: slots.length,
                    userMessage: `Cannot schedule ${companyIds.length} email${companyIds.length === 1 ? '' : 's'} on ${date} from ${startTime}. The day can only accommodate ${slots.length} more email${slots.length === 1 ? '' : 's'} from that start time.`,
                });
            }

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

            // Log to Logs_DoNotEdit for full audit trail
            const dataCol = entries.map(e => `${e.companyId} (${e.companyName || e.companyId}) → ${e.time}`).join('; ');
            await appendLogsDoNotEdit(
                actorName,
                'SCHEDULE_CREATE',
                `Created email schedule for ${entries.length} companies on ${date} (assigned to ${pic})`,
                dataCol,
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

            const completedCount = toSave.filter(e => e.completed === 'Y').length;

            // Log to Thread_History: one row per entry (use accurate message for the action)
            const nowPut = new Date().toISOString();
            const threadRows = toSave.map(e => {
                const remark = completedCount === toSave.length
                    ? `Marked schedule as complete for ${e.date} at ${e.time}`
                    : completedCount === 0
                        ? `Marked schedule as pending for ${e.date} at ${e.time}`
                        : `Email schedule updated to ${e.date} at ${e.time} (assigned to ${e.pic})`;
                return [nowPut, e.companyId, actorName, remark];
            });
            await appendThreadHistory(threadRows);

            // Log to Logs_DoNotEdit for full audit trail
            const action = completedCount === toSave.length ? 'SCHEDULE_MARK_COMPLETE' : completedCount === 0 ? 'SCHEDULE_MARK_PENDING' : 'SCHEDULE_UPDATE';
            const details = completedCount === toSave.length
                ? `Marked ${toSave.length} schedule entries as complete`
                : completedCount === 0
                    ? `Marked ${toSave.length} schedule entries as pending`
                    : `Updated ${toSave.length} schedule entries (${completedCount} complete, ${toSave.length - completedCount} pending)`;
            const dataCol = toSave.map(e => `${e.companyId} (${e.companyName || e.companyId}) ${e.date} ${e.time}`).join('; ');
            await appendLogsDoNotEdit(actorName, action, details, dataCol);

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

            // Log to Logs_DoNotEdit for full audit trail
            await appendLogsDoNotEdit(
                actorName,
                'SCHEDULE_DELETE',
                `Removed email schedule for ${companyIds.length} companies on ${date}`,
                companyIds.join('; '),
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
