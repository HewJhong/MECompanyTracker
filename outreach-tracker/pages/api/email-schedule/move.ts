import type { NextApiRequest, NextApiResponse } from 'next';
import {
    getEmailSchedule,
    saveEmailScheduleEntries,
    deleteEmailScheduleEntries,
    EmailScheduleEntry,
    computeTimeSlotsWithExisting,
} from '../../../lib/email-schedule';
import { formatActorLabel, requireEffectiveAdmin } from '../../../lib/authz';
import { getGoogleSheetsClient } from '../../../lib/google-sheets';
import { withSheetsRetry } from '../../../lib/sheets-retry';

async function appendAudit(
    threadRows: string[][],
    logAction: string,
    logDetails: string,
    logData: string,
    actorName: string,
    moveRef: string,
): Promise<void> {
    const spreadsheetId = process.env.SPREADSHEET_ID_2;
    if (!spreadsheetId) return;
    const sheets = await getGoogleSheetsClient();
    const now = new Date().toISOString();

    try {
        await withSheetsRetry(
            () =>
                sheets.spreadsheets.values.append({
                    spreadsheetId,
                    range: 'Thread_History!A:D',
                    valueInputOption: 'USER_ENTERED',
                    insertDataOption: 'INSERT_ROWS',
                    requestBody: { values: threadRows },
                }),
            4,
            `${moveRef}:Thread_History`,
        );
    } catch (historyErr) {
        const errMsg = historyErr instanceof Error ? historyErr.message : String(historyErr);
        console.error('[email-schedule:move] Thread_History_append_failed', { moveRef, message: errMsg });
        try {
            await withSheetsRetry(
                () =>
                    sheets.spreadsheets.values.append({
                        spreadsheetId,
                        range: 'Logs_DoNotEdit!A:E',
                        valueInputOption: 'RAW',
                        requestBody: {
                            values: [[now, actorName, 'THREAD_HISTORY_WRITE_FAILED', `Failed to append Thread_History: ${errMsg}`, JSON.stringify(threadRows)]],
                        },
                    }),
                4,
                `${moveRef}:THREAD_HISTORY_WRITE_FAILED`,
            );
            console.log('[email-schedule:move] Thread_History_failure_logged_to_Logs_DoNotEdit', { moveRef });
        } catch (logErr) {
            console.error('[email-schedule:move] could_not_log_Thread_History_failure', { moveRef, error: logErr });
        }
    }

    try {
        await withSheetsRetry(
            () =>
                sheets.spreadsheets.values.append({
                    spreadsheetId,
                    range: 'Logs_DoNotEdit!A:E',
                    valueInputOption: 'RAW',
                    requestBody: {
                        values: [[now, actorName, logAction, logDetails, logData]],
                    },
                }),
            4,
            `${moveRef}:Logs_DoNotEdit`,
        );
    } catch (err) {
        console.error('[email-schedule:move] Logs_DoNotEdit_append_failed', { moveRef, error: err });
    }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const ctx = await requireEffectiveAdmin(req, res);
    if (!ctx) return;
    const actorName = formatActorLabel(ctx);

    const { sourceEntries, targetDate, targetStartTime, pic } = req.body as {
        sourceEntries?: unknown;
        targetDate?: string;
        targetStartTime?: string;
        pic?: string;
    };

    if (!Array.isArray(sourceEntries) || sourceEntries.length === 0) {
        return res.status(400).json({ error: 'sourceEntries must be a non-empty array' });
    }
    if (!targetDate || !targetStartTime || !pic) {
        return res.status(400).json({ error: 'targetDate, targetStartTime, and pic are required' });
    }

    const typedSource = sourceEntries as Array<{ companyId: string; companyName?: string; date: string; time: string; order?: number; pic: string; createdAt?: string; createdBy?: string; note?: string; completed?: string }>;

    const moveRef = `schedule-move-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Validate target slot capacity before any writes
    const { slots } = await computeTimeSlotsWithExisting(targetDate, targetStartTime, typedSource.length);
    if (slots.length !== typedSource.length) {
        console.log('[email-schedule:move] capacity_rejected_no_writes', {
            moveRef,
            targetDate,
            targetStartTime,
            requestedCount: typedSource.length,
            availableSlots: slots.length,
        });
        return res.status(400).json({
            error: 'Schedule capacity exceeded',
            code: 'SCHEDULE_CAPACITY_EXCEEDED',
            targetDate,
            requestedCount: typedSource.length,
            availableSlots: slots.length,
            userMessage: `Cannot move ${typedSource.length} item${typedSource.length === 1 ? '' : 's'} to ${targetDate} from ${targetStartTime}. Only ${slots.length} slot${slots.length === 1 ? '' : 's'} available.`,
        });
    }

    try {
        const now = new Date().toISOString();
        const sourceDates = [...new Set(typedSource.map(e => e.date))];
        console.log('[email-schedule:move] start', {
            moveRef,
            entryCount: typedSource.length,
            sourceDates,
            targetDate,
            targetStartTime,
            pic,
            flow: 'server_single_handler_delete_then_save',
        });

        // Fetch current sheet state to preserve original createdAt/createdBy
        const existingByKey = new Map<string, EmailScheduleEntry>();
        for (const d of sourceDates) {
            const existing = await getEmailSchedule(d);
            for (const ex of existing) {
                const key = `${ex.companyId}|${ex.date}|${ex.time}|${ex.order ?? 0}`;
                existingByKey.set(key, ex);
            }
        }

        const newEntries: EmailScheduleEntry[] = typedSource.map((e, i) => {
            const key = `${e.companyId}|${e.date}|${e.time}|${e.order ?? i}`;
            const orig = existingByKey.get(key);
            return {
                companyId: e.companyId,
                companyName: e.companyName || e.companyId,
                pic,
                date: targetDate,
                time: slots[i],
                order: i,
                createdAt: orig?.createdAt || now,
                createdBy: orig?.createdBy || actorName,
                note: e.note?.trim() || undefined,
                completed: undefined,
            };
        });

        // Delete source entries per date, then write new entries.
        // Both operations use withSheetsRetry internally (via lib/email-schedule.ts).
        for (const date of sourceDates) {
            const idsOnDate = typedSource.filter(e => e.date === date).map(e => e.companyId);
            if (idsOnDate.length > 0) {
                await deleteEmailScheduleEntries(idsOnDate, date);
            }
        }
        await saveEmailScheduleEntries(newEntries);

        // Audit in Thread_History + Logs_DoNotEdit
        const threadRows = newEntries.map(e => [now, e.companyId, actorName, `Email schedule moved to ${targetDate} at ${e.time} (assigned to ${pic})`]);
        const logData = newEntries.map(e => `${e.companyId} (${e.companyName || e.companyId}) → ${targetDate} ${e.time}`).join('; ');
        await appendAudit(
            threadRows,
            'SCHEDULE_MOVE',
            `Moved ${newEntries.length} entries to ${targetDate} starting ${targetStartTime} (assigned to ${pic})`,
            logData,
            actorName,
            moveRef,
        );

        console.log('[email-schedule:move] complete', {
            moveRef,
            movedCount: newEntries.length,
            sourceDateCount: sourceDates.length,
            targetDate,
            auditThreadRows: threadRows.length,
        });

        return res.status(200).json({ success: true, entries: newEntries });
    } catch (error) {
        console.error('[email-schedule:move] error', { moveRef, error });
        return res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}
