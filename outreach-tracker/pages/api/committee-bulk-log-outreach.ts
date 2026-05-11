import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleSheetsClient } from '../../lib/google-sheets';
import { cache } from '../../lib/cache';
import { syncDailyStats } from '../../lib/daily-stats';
import { requireEffectiveCanEditCompanies, formatActorLabel } from '../../lib/authz';
import { withSheetsRetry } from '../../lib/sheets-retry';

const MAX_COMPANIES = 200;

// Zero-based column indices for tracker fields (column A = 0)
const TRACKER_COL = {
    contactStatus: 2,  // C
    lastContact: 9,    // J
    followUpsCompleted: 10, // K
    remarks: 14,       // O
    lastUpdate: 15,    // P
} as const;

function strCell(value: string) {
    return { userEnteredValue: { stringValue: value } };
}

function numCell(value: number) {
    return { userEnteredValue: { numberValue: value } };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const ctx = await requireEffectiveCanEditCompanies(req, res);
    if (!ctx) return;

    const { companyIds, user, remark, actionDate } = req.body as {
        companyIds?: unknown;
        user?: string;
        remark?: string;
        actionDate?: string;
    };

    if (!user || typeof user !== 'string') {
        return res.status(400).json({ message: 'Missing required field: user' });
    }
    if (!Array.isArray(companyIds) || companyIds.length === 0) {
        return res.status(400).json({ message: 'companyIds must be a non-empty array' });
    }

    const uniqueIds = [...new Set(companyIds.map(id => String(id ?? '').trim()).filter(Boolean))];
    if (uniqueIds.length === 0) {
        return res.status(400).json({ message: 'No valid company IDs' });
    }
    if (uniqueIds.length > MAX_COMPANIES) {
        return res.status(400).json({ message: `At most ${MAX_COMPANIES} companies per request` });
    }

    const spreadsheetId2 = process.env.SPREADSHEET_ID_2;
    if (!spreadsheetId2) {
        return res.status(500).json({ message: 'Spreadsheet ID not configured' });
    }

    const remarkText =
        typeof remark === 'string' && remark.trim()
            ? `[Outreach #0] ${remark.trim()}`
            : '[Outreach #0] Logged';

    const actionTimestamp =
        typeof actionDate === 'string' && actionDate.trim() && !Number.isNaN(Date.parse(actionDate))
            ? new Date(actionDate).toISOString()
            : new Date().toISOString();

    const serverTimestamp = new Date().toISOString();

    const updatesPayload = {
        contactStatus: 'Contacted',
        followUpsCompleted: 0,
        lastContact: actionTimestamp,
    };

    const batchLogRef = `bulk-log-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    try {
        const sheets = await getGoogleSheetsClient();
        console.log('[committee-bulk-log-outreach] start', {
            batchLogRef,
            companyCount: uniqueIds.length,
            user,
            writeMode: 'atomic_spreadsheets_batchUpdate',
        });

        // Single spreadsheets.get call — resolve tracker sheet name and numeric sheetIds for
        // Logs_DoNotEdit and Thread_History so we can issue one atomic batchUpdate below.
        const trackerMeta = await withSheetsRetry(
            () => sheets.spreadsheets.get({ spreadsheetId: spreadsheetId2 }),
            4,
            `${batchLogRef}:spreadsheets.get`,
        );

        const allSheets = trackerMeta.data.sheets ?? [];
        const trackerSheetName = allSheets[0]?.properties?.title;
        if (!trackerSheetName) {
            return res.status(500).json({ message: 'Tracker sheet not found' });
        }

        const trackerSheetId = allSheets[0]?.properties?.sheetId;
        const logsSheet = allSheets.find(s => s.properties?.title === 'Logs_DoNotEdit');
        const threadSheet = allSheets.find(s => s.properties?.title === 'Thread_History');

        if (trackerSheetId == null || !logsSheet?.properties || !threadSheet?.properties) {
            return res.status(500).json({
                message: 'Required sheet tabs (Logs_DoNotEdit, Thread_History) not found. Run a database sync to create them.',
            });
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
            `${batchLogRef}:values.get_tracker_A2C`,
        );

        const rows = (dataResponse.data.values || []) as string[][];
        type Resolved = { companyId: string; rowIndex: number; displayName: string };
        const resolved: Resolved[] = [];
        const errors: string[] = [];

        for (const companyId of uniqueIds) {
            const idx = rows.findIndex(r => String(r[0] ?? '').trim() === companyId);
            if (idx === -1) {
                errors.push(`${companyId}: not found`);
                continue;
            }
            const contactRaw = String(rows[idx][2] ?? '').trim();
            if (contactRaw !== 'To Contact') {
                errors.push(`${companyId}: contact status is "${contactRaw || '(empty)'}", expected To Contact`);
                continue;
            }
            const displayName = String(rows[idx][1] ?? '').trim() || companyId;
            // idx is 0-based within values[] which starts at row 2 → sheet row = idx + 2
            // For spreadsheets.batchUpdate UpdateCells, rowIndex is 0-based → sheet row - 1 = idx + 1
            resolved.push({ companyId, rowIndex: idx + 1, displayName });
        }

        if (errors.length > 0 || resolved.length !== uniqueIds.length) {
            console.log('[committee-bulk-log-outreach] validation_failed_no_writes', {
                batchLogRef,
                errorCount: errors.length,
                resolvedCount: resolved.length,
                expectedCount: uniqueIds.length,
            });
            return res.status(400).json({
                message: 'Batch validation failed; no changes applied.',
                errors,
            });
        }

        console.log('[committee-bulk-log-outreach] validation_ok', {
            batchLogRef,
            resolvedCount: resolved.length,
        });

        const actor = formatActorLabel(ctx);

        // Build one atomic spreadsheets.batchUpdate containing:
        //   - UpdateCells for each tracker row (5 fields per company)
        //   - AppendCells to Logs_DoNotEdit (one row per company)
        //   - AppendCells to Thread_History (one row per company)
        // Google guarantees all-or-nothing for a single batchUpdate call.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const requests: any[] = [];

        for (const r of resolved) {
            const ri = r.rowIndex; // 0-based sheet row index

            const fields = 'userEnteredValue';

            requests.push(
                {
                    updateCells: {
                        range: { sheetId: trackerSheetId, startRowIndex: ri, endRowIndex: ri + 1, startColumnIndex: TRACKER_COL.lastUpdate, endColumnIndex: TRACKER_COL.lastUpdate + 1 },
                        rows: [{ values: [strCell(serverTimestamp)] }],
                        fields,
                    },
                },
                {
                    updateCells: {
                        range: { sheetId: trackerSheetId, startRowIndex: ri, endRowIndex: ri + 1, startColumnIndex: TRACKER_COL.contactStatus, endColumnIndex: TRACKER_COL.contactStatus + 1 },
                        rows: [{ values: [strCell('Contacted')] }],
                        fields,
                    },
                },
                {
                    updateCells: {
                        range: { sheetId: trackerSheetId, startRowIndex: ri, endRowIndex: ri + 1, startColumnIndex: TRACKER_COL.followUpsCompleted, endColumnIndex: TRACKER_COL.followUpsCompleted + 1 },
                        rows: [{ values: [numCell(0)] }],
                        fields,
                    },
                },
                {
                    updateCells: {
                        range: { sheetId: trackerSheetId, startRowIndex: ri, endRowIndex: ri + 1, startColumnIndex: TRACKER_COL.lastContact, endColumnIndex: TRACKER_COL.lastContact + 1 },
                        rows: [{ values: [strCell(actionTimestamp)] }],
                        fields,
                    },
                },
                {
                    updateCells: {
                        range: { sheetId: trackerSheetId, startRowIndex: ri, endRowIndex: ri + 1, startColumnIndex: TRACKER_COL.remarks, endColumnIndex: TRACKER_COL.remarks + 1 },
                        rows: [{ values: [strCell(remarkText)] }],
                        fields,
                    },
                },
            );
        }

        // Append to Logs_DoNotEdit — one row per company
        requests.push({
            appendCells: {
                sheetId: logsSheetId,
                rows: resolved.map(r => ({
                    values: [
                        strCell(serverTimestamp),
                        strCell(user),
                        strCell('COMPANY_UPDATE'),
                        strCell(`${r.companyId} – ${r.displayName}`),
                        strCell(JSON.stringify(updatesPayload)),
                    ],
                })),
                fields: 'userEnteredValue',
            },
        });

        // Append to Thread_History — one row per company
        requests.push({
            appendCells: {
                sheetId: threadSheetId,
                rows: resolved.map(r => ({
                    values: [
                        strCell(actionTimestamp),
                        strCell(r.companyId),
                        strCell(actor),
                        strCell(remarkText),
                    ],
                })),
                fields: 'userEnteredValue',
            },
        });

        const subRequestCount = requests.length;
        const batchWriteStarted = Date.now();
        console.log('[committee-bulk-log-outreach] atomic_batchUpdate_start', {
            batchLogRef,
            subRequestCount,
            trackerUpdateCells: resolved.length * 5,
            logsAppendRows: resolved.length,
            threadAppendRows: resolved.length,
        });

        await withSheetsRetry(
            () =>
                sheets.spreadsheets.batchUpdate({
                    spreadsheetId: spreadsheetId2,
                    requestBody: { requests },
                }),
            4,
            `${batchLogRef}:spreadsheets.batchUpdate_atomic`,
        );

        const batchWriteMs = Date.now() - batchWriteStarted;
        console.log('[committee-bulk-log-outreach] atomic_batchUpdate_ok', {
            batchLogRef,
            subRequestCount,
            batchWriteMs,
            message: 'Tracker + Logs_DoNotEdit + Thread_History committed in one Sheets revision',
        });

        cache.delete('sheet_data');
        await syncDailyStats(sheets, spreadsheetId2);

        console.log('[committee-bulk-log-outreach] complete', {
            batchLogRef,
            updated: resolved.length,
            batchWriteMs,
        });

        return res.status(200).json({
            success: true,
            updated: resolved.length,
            companyIds: resolved.map(r => r.companyId),
        });
    } catch (error) {
        console.error('[committee-bulk-log-outreach] error_no_partial_tracker_from_this_handler', {
            batchLogRef,
            error,
        });
        return res.status(500).json({
            message: error instanceof Error ? error.message : 'Batch log outreach failed. No changes were applied.',
        });
    }
}
