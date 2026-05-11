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
import { withSheetsRetry } from '../../../lib/sheets-retry';

async function appendThreadHistory(rows: string[][], retryLabel: string): Promise<void> {
    if (rows.length === 0) return;
    const spreadsheetId = process.env.SPREADSHEET_ID_2;
    if (!spreadsheetId) return;
    const sheets = await getGoogleSheetsClient();
    await withSheetsRetry(
        () =>
            sheets.spreadsheets.values.append({
                spreadsheetId,
                range: 'Thread_History!A:D',
                valueInputOption: 'USER_ENTERED',
                insertDataOption: 'INSERT_ROWS',
                requestBody: { values: rows },
            }),
        4,
        retryLabel,
    );
}

async function appendLogsDoNotEdit(
    actorName: string,
    action: string,
    details: string,
    data: string,
    retryLabel: string,
): Promise<void> {
    const spreadsheetId = process.env.SPREADSHEET_ID_2;
    if (!spreadsheetId) return;
    const sheets = await getGoogleSheetsClient();
    await withSheetsRetry(
        () =>
            sheets.spreadsheets.values.append({
                spreadsheetId,
                range: 'Logs_DoNotEdit!A:E',
                valueInputOption: 'RAW',
                requestBody: {
                    values: [[new Date().toISOString(), actorName, action, details, data]],
                },
            }),
        4,
        retryLabel,
    );
}

async function appendThreadHistoryWithFallback(rows: string[][], actorName: string, retryLabel: string): Promise<void> {
    try {
        await appendThreadHistory(rows, `${retryLabel}:Thread_History`);
        console.log('[email-schedule] Thread_History_append_ok', { retryLabel, rowCount: rows.length });
    } catch (historyErr) {
        const errMsg = historyErr instanceof Error ? historyErr.message : String(historyErr);
        console.error('[email-schedule] Thread_History_append_failed_after_retries', {
            retryLabel,
            rowCount: rows.length,
            message: errMsg,
        });
        try {
            await appendLogsDoNotEdit(
                actorName,
                'THREAD_HISTORY_WRITE_FAILED',
                `Failed to append Thread_History: ${errMsg}`,
                JSON.stringify(rows),
                `${retryLabel}:THREAD_HISTORY_WRITE_FAILED`,
            );
            console.log('[email-schedule] Thread_History_failure_logged_to_Logs_DoNotEdit', { retryLabel });
        } catch (logErr) {
            console.error('[email-schedule] could_not_log_Thread_History_failure', { retryLabel, error: logErr });
        }
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
            await appendThreadHistoryWithFallback(
                entries.map(e => [now, e.companyId, actorName, `Email schedule set for ${e.date} at ${e.time} (assigned to ${pic})`]),
                actorName,
                'email-schedule:POST',
            );

            // Log to Logs_DoNotEdit for full audit trail
            const dataCol = entries.map(e => `${e.companyId} (${e.companyName || e.companyId}) → ${e.time}`).join('; ');
            await appendLogsDoNotEdit(
                actorName,
                'SCHEDULE_CREATE',
                `Created email schedule for ${entries.length} companies on ${date} (assigned to ${pic})`,
                dataCol,
                'email-schedule:POST:Logs_DoNotEdit',
            );

            console.log('[email-schedule] POST_complete', {
                path: 'schedule_create',
                entryCount: entries.length,
                date,
                pic,
                threadRows: entries.length,
            });

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

            // Preserve original createdAt / createdBy from the sheet so completion toggles
            // and reschedules do not erase who originally scheduled each entry.
            const affectedDates = [...new Set(entries.map(e => e.date))];
            const existingByKey = new Map<string, EmailScheduleEntry>();
            for (const d of affectedDates) {
                const existing = await getEmailSchedule(d);
                for (const ex of existing) {
                    const key = `${ex.companyId}|${ex.date}|${ex.time}|${ex.order ?? 0}`;
                    existingByKey.set(key, ex);
                }
            }

            const toSave: EmailScheduleEntry[] = entries.map((e, i) => {
                const key = `${e.companyId}|${e.date}|${e.time}|${e.order ?? i}`;
                const orig = existingByKey.get(key);
                return {
                    companyId: e.companyId,
                    companyName: e.companyName || e.companyId,
                    pic: e.pic,
                    date: e.date,
                    time: e.time,
                    order: e.order ?? i,
                    createdAt: orig?.createdAt || now,
                    createdBy: orig?.createdBy || actorName,
                    note: e.note?.trim() || undefined,
                    completed: e.completed || undefined,
                };
            });

            const preservedCreatedMetaCount = toSave.filter((e, i) => {
                const key = `${e.companyId}|${e.date}|${e.time}|${e.order ?? i}`;
                return Boolean(existingByKey.get(key)?.createdAt);
            }).length;

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
            await appendThreadHistoryWithFallback(threadRows, actorName, 'email-schedule:PUT');

            // Log to Logs_DoNotEdit for full audit trail
            const action = completedCount === toSave.length ? 'SCHEDULE_MARK_COMPLETE' : completedCount === 0 ? 'SCHEDULE_MARK_PENDING' : 'SCHEDULE_UPDATE';
            const details = completedCount === toSave.length
                ? `Marked ${toSave.length} schedule entries as complete`
                : completedCount === 0
                    ? `Marked ${toSave.length} schedule entries as pending`
                    : `Updated ${toSave.length} schedule entries (${completedCount} complete, ${toSave.length - completedCount} pending)`;
            const dataCol = toSave.map(e => `${e.companyId} (${e.companyName || e.companyId}) ${e.date} ${e.time}`).join('; ');
            await appendLogsDoNotEdit(actorName, action, details, dataCol, 'email-schedule:PUT:Logs_DoNotEdit');

            console.log('[email-schedule] PUT_complete', {
                path: 'schedule_update',
                entryCount: toSave.length,
                completedCount,
                action,
                preservedCreatedMetaCount,
                threadRows: threadRows.length,
            });

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
            await appendThreadHistoryWithFallback(
                companyIds.map(id => [nowDel, id, actorName, `Email schedule removed for ${date}`]),
                actorName,
                'email-schedule:DELETE',
            );

            // Log to Logs_DoNotEdit for full audit trail
            await appendLogsDoNotEdit(
                actorName,
                'SCHEDULE_DELETE',
                `Removed email schedule for ${companyIds.length} companies on ${date}`,
                companyIds.join('; '),
                'email-schedule:DELETE:Logs_DoNotEdit',
            );

            console.log('[email-schedule] DELETE_complete', {
                path: 'schedule_delete',
                companyCount: companyIds.length,
                date,
                threadRows: companyIds.length,
            });

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
