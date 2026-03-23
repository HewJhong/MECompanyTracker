import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleSheetsClient } from '../../lib/google-sheets';
import { cache } from '../../lib/cache';
import { saveEmailScheduleEntries, computeTimeSlotsWithExisting, EmailScheduleEntry } from '../../lib/email-schedule';
import { formatActorLabel, requireEffectiveAdmin } from '../../lib/authz';

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const ctx = await requireEffectiveAdmin(req, res);
        if (!ctx) return;

        const { companyIds, assignee, companyNames, scheduleDate, scheduleStartTime } = req.body;

        // Validate inputs
        if (!Array.isArray(companyIds) || companyIds.length === 0) {
            return res.status(400).json({ error: 'Invalid or empty company IDs array' });
        }

        if (!assignee || typeof assignee !== 'string') {
            return res.status(400).json({ error: 'Invalid assignee' });
        }

        // Get Google Sheets client
        const sheets = await getGoogleSheetsClient();
        const spreadsheetId = process.env.SPREADSHEET_ID_2;

        if (!spreadsheetId) {
            return res.status(500).json({ error: 'Spreadsheet ID not configured' });
        }

        // Fetch metadata to get the correct sheet name
        const metadata = await sheets.spreadsheets.get({ spreadsheetId });
        const sheetName = metadata.data.sheets?.[0].properties?.title;

        if (!sheetName) {
            return res.status(500).json({ error: 'Could not determine sheet name' });
        }

        // Quote sheet name if it contains spaces or special characters
        const safeSheetName = `'${sheetName.replace(/'/g, "''")}'`;

        // Read current data to find row numbers
        const dataResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${safeSheetName}!A:Z`,
        });

        const rows = dataResponse.data.values || [];
        if (rows.length === 0) {
            return res.status(404).json({ error: 'No data found in sheet' });
        }

        const headers = rows[0].map((h: string) => h.toLowerCase().trim());
        const picColumnIndex = headers.findIndex((h: string) =>
            h === 'assigned pic' || h === 'pic' || h === 'assigned to'
        );
        const lastUpdatedColumnIndex = headers.findIndex((h: string) =>
            h === 'last updated' || h === 'last update' || h === 'updated'
        );

        if (picColumnIndex === -1) {
            console.error('Available headers:', rows[0]);
            return res.status(500).json({
                error: 'Assigned PIC column not found in sheet',
                details: `Available columns: ${rows[0].join(', ')}`
            });
        }

        // Build batch update requests for each company
        const updates = [];
        const successfulIds: string[] = [];
        const timestamp = new Date().toISOString();

        for (const companyId of companyIds) {
            const valueToSave = assignee === '__UNASSIGN__' ? '' : assignee;
            const rowIndex = rows.findIndex(row => row[0] === companyId);
            if (rowIndex > 0) {
                // Update PIC column
                updates.push({
                    range: `${safeSheetName}!${String.fromCharCode(65 + picColumnIndex)}${rowIndex + 1}`,
                    values: [[valueToSave]],
                });

                // Update Last Updated column if it exists
                if (lastUpdatedColumnIndex !== -1) {
                    updates.push({
                        range: `${safeSheetName}!${String.fromCharCode(65 + lastUpdatedColumnIndex)}${rowIndex + 1}`,
                        values: [[timestamp]],
                    });
                }
                successfulIds.push(companyId);
            }
        }

        if (updates.length === 0) {
            return res.status(404).json({ error: 'No matching companies found' });
        }

        // Strict schedule capacity validation BEFORE any writes.
        // If scheduling is requested, reject the whole assignment when the selected day is full.
        let precomputedScheduleSlots: string[] = [];
        if (scheduleDate && scheduleStartTime && assignee !== '__UNASSIGN__' && successfulIds.length > 0) {
            const { slots } = await computeTimeSlotsWithExisting(scheduleDate, scheduleStartTime, successfulIds.length);
            if (slots.length !== successfulIds.length) {
                return res.status(400).json({
                    error: 'Schedule capacity exceeded',
                    code: 'SCHEDULE_CAPACITY_EXCEEDED',
                    date: scheduleDate,
                    requestedEmails: successfulIds.length,
                    maxEmailsAssignableFromStart: slots.length,
                    userMessage: `Cannot assign with schedule: ${scheduleDate} can only accommodate ${slots.length} more email${slots.length === 1 ? '' : 's'} from ${scheduleStartTime}, but ${successfulIds.length} were selected.`,
                });
            }
            precomputedScheduleSlots = slots;
        }

        // Execute batch update
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: {
                valueInputOption: 'USER_ENTERED', // Use USER_ENTERED to allow Sheets to parse the date if needed
                data: updates,
            },
        });

        // Invalidate cache to ensure fresh data is fetched
        cache.delete('sheet_data');

        // Optionally create email schedule entries (before logging so we can include schedule in log details)
        let scheduleEntries: EmailScheduleEntry[] = [];
        if (scheduleDate && scheduleStartTime && assignee !== '__UNASSIGN__' && successfulIds.length > 0) {
            try {
                const now = new Date().toISOString();
                const actorName = formatActorLabel(ctx);
                scheduleEntries = successfulIds.map((id, i) => ({
                    companyId: id,
                    companyName: (companyNames as Record<string, string> | undefined)?.[id] || id,
                    pic: assignee,
                    date: scheduleDate,
                    time: precomputedScheduleSlots[i],
                    order: i,
                    createdAt: now,
                    createdBy: actorName,
                }));
                await saveEmailScheduleEntries(scheduleEntries);

                // Log each company's schedule to Thread_History
                const threadTimestamp = new Date().toISOString();
                const threadRows = scheduleEntries.map(e => [
                    threadTimestamp,
                    e.companyId,
                    actorName,
                    `Email schedule set for ${e.date} at ${e.time} via bulk assign (assigned to ${assignee})`,
                ]);
                try {
                    await sheets.spreadsheets.values.append({
                        spreadsheetId,
                        range: 'Thread_History!A:D',
                        valueInputOption: 'USER_ENTERED',
                        requestBody: { values: threadRows },
                    });
                } catch (threadErr) {
                    console.error('Failed to write bulk-assign schedules to Thread_History:', threadErr);
                }
            } catch (scheduleError) {
                console.error('Failed to create email schedule entries:', scheduleError);
                // Capacity is validated above; if this fails here, it's an internal write failure.
                return res.status(500).json({
                    error: 'Failed to save validated email schedule',
                    details: scheduleError instanceof Error ? scheduleError.message : 'Unknown schedule write error',
                });
            }
        }

        // Log the assignment action to Logs sheet with full details: companies and (when created) time per company
        const companyNamesMap = (companyNames as Record<string, string> | undefined) || {};
        const details =
            scheduleEntries.length > 0
                ? `Assigned ${successfulIds.length} companies to ${assignee}; email schedule for ${scheduleDate} (see Data column for per-company times)`
                : `Assigned ${successfulIds.length} companies to ${assignee}`;
        const dataColumn =
            scheduleEntries.length > 0
                ? scheduleEntries
                    .map(
                        (e) =>
                            `${e.companyId} (${e.companyName || e.companyId}) → ${e.time}`
                    )
                    .join('; ')
                : successfulIds
                    .map(
                        (id) =>
                            `${id} (${companyNamesMap[id] || id})`
                    )
                    .join('; ');
        try {
            await sheets.spreadsheets.values.append({
                spreadsheetId,
                range: 'Logs_DoNotEdit!A:E',
                valueInputOption: 'RAW',
                requestBody: {
                    values: [[
                        new Date().toISOString(),
                                formatActorLabel(ctx),
                        'BULK_ASSIGN',
                        details,
                        dataColumn,
                    ]],
                },
            });
        } catch (logError) {
            console.error('Failed to log assignment:', logError);
            // Don't fail the request if logging fails
        }

        return res.status(200).json({
            success: true,
            updated: successfulIds.length,
            companyIds: successfulIds,
            scheduleCreated: scheduleEntries.length > 0,
        });
    } catch (error) {
        console.error('Bulk assign error:', error);
        return res.status(500).json({
            error: 'Failed to assign companies',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
