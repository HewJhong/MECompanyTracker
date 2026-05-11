import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleSheetsClient } from '../../../lib/google-sheets';
import { cache } from '../../../lib/cache';
import { syncDailyStats } from '../../../lib/daily-stats';
import { requireEffectiveCanEditCompanies, formatActorLabel } from '../../../lib/authz';
import { withSheetsRetry, isRetryableSheetsError } from '../../../lib/sheets-retry';

const MAX_ITEMS = 200;
const BATCH_GET_CHUNK = 90;
/** Max companies per `spreadsheets.batchUpdate` so sub-requests stay under Sheets limits (~6 cells + 2 appends each). */
const BATCH_UPDATE_CHUNK = 40;

// Zero-based column indices (column A = 0) — must match committee-bulk-log-outreach / tracker layout
const TRACKER_COL = {
    contactStatus: 2,
    lastContact: 9,
    followUpsCompleted: 10,
    remarks: 14,
    lastUpdate: 15,
} as const;

function strCell(value: string) {
    return { userEnteredValue: { stringValue: value } };
}

function numCell(value: number) {
    return { userEnteredValue: { numberValue: value } };
}

type ItemBody = {
    companyId?: unknown;
    updates?: Record<string, unknown>;
    remark?: unknown;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const ctx = await requireEffectiveCanEditCompanies(req, res);
    if (!ctx) return;

    const body = req.body as {
        user?: unknown;
        actionDate?: unknown;
        items?: unknown;
    };

    const user = typeof body.user === 'string' ? body.user.trim() : '';
    if (!user) {
        return res.status(400).json({ message: 'Missing required field: user' });
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
        return res.status(400).json({ message: 'items must be a non-empty array' });
    }

    const rawItems = body.items as ItemBody[];
    if (rawItems.length > MAX_ITEMS) {
        return res.status(400).json({ message: `At most ${MAX_ITEMS} companies per request` });
    }
    for (const raw of rawItems) {
        const id = String(raw?.companyId ?? '').trim();
        if (!id) {
            return res.status(400).json({ message: 'Each item must include a non-empty companyId' });
        }
    }

    const batchRef = `sched-bulk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Last occurrence wins if the client sent duplicate company IDs
    const byId = new Map<string, ItemBody>();
    for (const raw of rawItems) {
        const id = String(raw?.companyId ?? '').trim();
        byId.set(id, raw);
    }
    const items = Array.from(byId.values());
    if (items.length !== rawItems.length) {
        console.warn('[email-schedule/bulk-mark-tracker] deduped items', {
            batchRef,
            before: rawItems.length,
            after: items.length,
        });
    }

    const actionTimestamp =
        typeof body.actionDate === 'string' && body.actionDate.trim() && !Number.isNaN(Date.parse(body.actionDate))
            ? new Date(body.actionDate).toISOString()
            : new Date().toISOString();
    const serverTimestamp = new Date().toISOString();
    const actor = formatActorLabel(ctx);

    const spreadsheetId2 = process.env.SPREADSHEET_ID_2;
    if (!spreadsheetId2) {
        return res.status(500).json({ message: 'Spreadsheet ID not configured' });
    }

    try {
        const sheets = await getGoogleSheetsClient();

        const trackerMeta = await withSheetsRetry(
            () => sheets.spreadsheets.get({ spreadsheetId: spreadsheetId2 }),
            4,
            `${batchRef}:get`,
        );

        const allSheets = trackerMeta.data.sheets ?? [];
        const trackerSheetName = allSheets[0]?.properties?.title;
        const trackerSheetId = allSheets[0]?.properties?.sheetId;
        const logsSheet = allSheets.find(s => s.properties?.title === 'Logs_DoNotEdit');
        const threadSheet = allSheets.find(s => s.properties?.title === 'Thread_History');

        if (!trackerSheetName || trackerSheetId == null || !logsSheet?.properties || !threadSheet?.properties) {
            return res.status(500).json({ message: 'Required tracker / logs / history sheets not found' });
        }
        const logsSheetId = logsSheet.properties.sheetId!;
        const threadSheetId = threadSheet.properties.sheetId!;
        const safeSheetName = `'${trackerSheetName.replace(/'/g, "''")}'`;

        const dataResponse = await withSheetsRetry(
            () =>
                sheets.spreadsheets.values.get({
                    spreadsheetId: spreadsheetId2,
                    range: `${safeSheetName}!A2:C`,
                }),
            4,
            `${batchRef}:A2C`,
        );

        const rows = (dataResponse.data.values || []) as string[][];
        type Resolved = {
            companyId: string;
            displayName: string;
            /** 0-based row index for batchUpdate UpdateCells (row 2 of sheet → 1) */
            row0: number;
            updates: Record<string, unknown>;
            initialRemark: string;
        };

        const resolved: Resolved[] = [];
        const errors: string[] = [];

        for (const raw of items) {
            const companyId = String(raw?.companyId ?? '').trim();
            if (!companyId) {
                errors.push('missing companyId');
                continue;
            }
            const upd = raw?.updates && typeof raw.updates === 'object' ? raw.updates : null;
            if (!upd) {
                errors.push(`${companyId}: missing updates`);
                continue;
            }
            const idx = rows.findIndex(r => String(r[0] ?? '').trim() === companyId);
            if (idx === -1) {
                errors.push(`${companyId}: not found`);
                continue;
            }
            const displayName = String(rows[idx][1] ?? '').trim() || companyId;
            const row0 = idx + 1;
            const initialRemark = typeof raw.remark === 'string' ? raw.remark : '';
            resolved.push({ companyId, displayName, row0, updates: { ...upd }, initialRemark });
        }

        if (errors.length > 0 || resolved.length !== items.length) {
            return res.status(400).json({
                message: 'Batch validation failed; no changes applied.',
                errors,
            });
        }

        // Rows that need G:K for No Reply auto logic (same as /api/update when contactStatus omitted)
        const needsGk = resolved.filter(r => r.updates.contactStatus === undefined || r.updates.contactStatus === null);
        const gkByCompany = new Map<string, string[]>();

        for (let i = 0; i < needsGk.length; i += BATCH_GET_CHUNK) {
            const chunk = needsGk.slice(i, i + BATCH_GET_CHUNK);
            const ranges = chunk.map(r => `${safeSheetName}!G${r.row0 + 1}:K${r.row0 + 1}`);
            const batch = await withSheetsRetry(
                () =>
                    sheets.spreadsheets.values.batchGet({
                        spreadsheetId: spreadsheetId2,
                        ranges,
                    }),
                4,
                `${batchRef}:batchGk`,
            );
            const valueRanges = batch.data.valueRanges || [];
            chunk.forEach((r, j) => {
                const vals = valueRanges[j]?.values?.[0] || [];
                gkByCompany.set(r.companyId, vals);
            });
        }

        type FinalRow = Resolved & { remarkText: string; historyText: string; logUpdates: Record<string, unknown> };

        const finals: FinalRow[] = [];

        for (const r of resolved) {
            let remarkText = r.initialRemark;
            const logUpdates = { ...r.updates };

            if (r.updates.contactStatus === undefined || r.updates.contactStatus === null) {
                const gk = gkByCompany.get(r.companyId) || [];
                const lastCompanyContact = gk[2];
                const lastContactCol = gk[3];
                const currentFollowUps =
                    parseInt(String(r.updates.followUpsCompleted ?? gk[4] ?? ''), 10) || 0;

                const tsCompany = lastCompanyContact ? new Date(String(lastCompanyContact)).getTime() : 0;
                const tsCommittee = lastContactCol ? new Date(String(lastContactCol)).getTime() : 0;
                const lastContactDate = Math.max(tsCompany, tsCommittee);

                if (currentFollowUps >= 3 && lastContactDate > 0) {
                    const daysSinceResponse = (Date.now() - lastContactDate) / (1000 * 60 * 60 * 24);
                    if (daysSinceResponse > 3) {
                        r.updates.contactStatus = 'No Reply';
                        logUpdates.contactStatus = 'No Reply';
                        remarkText =
                            remarkText ||
                            `[Auto] Marked as No Reply after 3 follow-ups with no response for ${Math.floor(daysSinceResponse)} days`;
                    }
                }
            }

            const historyText =
                remarkText ||
                `[Update] ${Object.keys(logUpdates)
                    .filter(k => logUpdates[k] !== undefined && logUpdates[k] !== '')
                    .join(', ')}`;

            finals.push({ ...r, remarkText, historyText, logUpdates });
        }

        const buildChunkRequests = (slice: FinalRow[]) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const chunkRequests: any[] = [];
            for (const f of slice) {
                const ri = f.row0;

                chunkRequests.push({
                    updateCells: {
                        range: {
                            sheetId: trackerSheetId,
                            startRowIndex: ri,
                            endRowIndex: ri + 1,
                            startColumnIndex: TRACKER_COL.lastUpdate,
                            endColumnIndex: TRACKER_COL.lastUpdate + 1,
                        },
                        rows: [{ values: [strCell(serverTimestamp)] }],
                        fields: 'userEnteredValue',
                    },
                });

                if (f.updates.contactStatus !== undefined && f.updates.contactStatus !== null) {
                    chunkRequests.push({
                        updateCells: {
                            range: {
                                sheetId: trackerSheetId,
                                startRowIndex: ri,
                                endRowIndex: ri + 1,
                                startColumnIndex: TRACKER_COL.contactStatus,
                                endColumnIndex: TRACKER_COL.contactStatus + 1,
                            },
                            rows: [{ values: [strCell(String(f.updates.contactStatus))] }],
                            fields: 'userEnteredValue',
                        },
                    });
                }

                if (f.updates.followUpsCompleted !== undefined && f.updates.followUpsCompleted !== null) {
                    const n = parseInt(String(f.updates.followUpsCompleted), 10);
                    if (!Number.isNaN(n)) {
                        chunkRequests.push({
                            updateCells: {
                                range: {
                                    sheetId: trackerSheetId,
                                    startRowIndex: ri,
                                    endRowIndex: ri + 1,
                                    startColumnIndex: TRACKER_COL.followUpsCompleted,
                                    endColumnIndex: TRACKER_COL.followUpsCompleted + 1,
                                },
                                rows: [{ values: [numCell(n)] }],
                                fields: 'userEnteredValue',
                            },
                        });
                    }
                }

                if (f.updates.lastContact !== undefined && f.updates.lastContact !== null) {
                    chunkRequests.push({
                        updateCells: {
                            range: {
                                sheetId: trackerSheetId,
                                startRowIndex: ri,
                                endRowIndex: ri + 1,
                                startColumnIndex: TRACKER_COL.lastContact,
                                endColumnIndex: TRACKER_COL.lastContact + 1,
                            },
                            rows: [{ values: [strCell(String(f.updates.lastContact))] }],
                            fields: 'userEnteredValue',
                        },
                    });
                }

                if (f.remarkText) {
                    chunkRequests.push({
                        updateCells: {
                            range: {
                                sheetId: trackerSheetId,
                                startRowIndex: ri,
                                endRowIndex: ri + 1,
                                startColumnIndex: TRACKER_COL.remarks,
                                endColumnIndex: TRACKER_COL.remarks + 1,
                            },
                            rows: [{ values: [strCell(f.remarkText)] }],
                            fields: 'userEnteredValue',
                        },
                    });
                }
            }

            chunkRequests.push({
                appendCells: {
                    sheetId: logsSheetId,
                    rows: slice.map(f => ({
                        values: [
                            strCell(serverTimestamp),
                            strCell(user),
                            strCell('COMPANY_UPDATE'),
                            strCell(`${f.companyId} – ${f.displayName}`),
                            strCell(JSON.stringify(f.logUpdates)),
                        ],
                    })),
                    fields: 'userEnteredValue',
                },
            });

            chunkRequests.push({
                appendCells: {
                    sheetId: threadSheetId,
                    rows: slice.map(f => ({
                        values: [
                            strCell(actionTimestamp),
                            strCell(f.companyId),
                            strCell(actor),
                            strCell(f.historyText),
                        ],
                    })),
                    fields: 'userEnteredValue',
                },
            });

            return chunkRequests;
        };

        for (let ci = 0; ci < finals.length; ci += BATCH_UPDATE_CHUNK) {
            const slice = finals.slice(ci, ci + BATCH_UPDATE_CHUNK);
            const requests = buildChunkRequests(slice);
            await withSheetsRetry(
                () =>
                    sheets.spreadsheets.batchUpdate({
                        spreadsheetId: spreadsheetId2,
                        requestBody: { requests },
                    }),
                4,
                `${batchRef}:batchUpdate_${ci}`,
            );
        }

        cache.delete('sheet_data');
        await syncDailyStats(sheets, spreadsheetId2);

        console.log('[email-schedule/bulk-mark-tracker] complete', {
            batchRef,
            updated: finals.length,
        });

        return res.status(200).json({
            success: true,
            updated: finals.length,
            companyIds: finals.map(f => f.companyId),
        });
    } catch (error) {
        console.error('[email-schedule/bulk-mark-tracker] error', { batchRef, error });
        if (isRetryableSheetsError(error)) {
            return res.status(503).json({ message: 'Sheets quota exceeded — please retry in a moment', quota: true });
        }
        return res.status(500).json({
            message: error instanceof Error ? error.message : 'Batch tracker update failed — some companies may already have been updated.',
        });
    }
}
