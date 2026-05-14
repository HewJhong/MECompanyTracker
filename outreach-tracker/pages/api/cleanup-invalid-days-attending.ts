import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleSheetsClient } from '../../lib/google-sheets';
import { cache } from '../../lib/cache';
import { formatActorLabel, requireEffectiveAdmin } from '../../lib/authz';
import { TRACKER_COLUMN, TRACKER_ROW_INDEX } from '../../lib/tracker-sheet-columns';

type ClearedRow = { companyId: string; rowNum: number; reason: string };

const BATCH_SIZE = 100;

/**
 * Clears Tracker column N (Days attending) when invalid for dashboard rules:
 * - relationship is not Registered, or
 * - Registered but sponsorship tier (M) is empty
 *
 * Days attending is only meaningful for Registered sponsors with a tier.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const ctx = await requireEffectiveAdmin(req, res);
    if (!ctx) return;

    const dryRun =
        req.query.dryRun === '1' ||
        (typeof req.body === 'object' && req.body !== null && (req.body as { dryRun?: boolean }).dryRun === true);

    try {
        const sheets = await getGoogleSheetsClient();
        const spreadsheetId = process.env.SPREADSHEET_ID_2;
        if (!spreadsheetId) {
            return res.status(500).json({ error: 'Spreadsheet ID not configured' });
        }

        const metadata = await sheets.spreadsheets.get({ spreadsheetId });
        const sheetName = metadata.data.sheets?.[0].properties?.title;
        if (!sheetName) {
            return res.status(500).json({ error: 'Could not determine sheet name' });
        }

        const safeSheetName = `'${sheetName.replace(/'/g, "''")}'`;

        const dataResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${safeSheetName}!A:P`,
        });

        const rows = (dataResponse.data.values || []) as string[][];
        if (rows.length < 2) {
            return res.status(200).json({ dryRun, cleared: 0, companies: [] as ClearedRow[], batches: 0 });
        }

        const toClear: ClearedRow[] = [];

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const companyId = (row[0] || '').toString().trim();
            if (!companyId) continue;

            const relationship = (row[TRACKER_ROW_INDEX.relationshipStatus] || '').toString().trim();
            const tier = (row[TRACKER_ROW_INDEX.sponsorshipTier] || '').toString().trim();
            const days = (row[TRACKER_ROW_INDEX.daysAttending] || '').toString().trim();
            if (!days) continue;

            const invalid = relationship !== 'Registered' || !tier;
            if (!invalid) continue;

            const reason =
                relationship !== 'Registered'
                    ? `Relationship is ${relationship || '(blank)'}`
                    : 'Registered but sponsorship tier is empty';
            toClear.push({ companyId, rowNum: i + 1, reason });
        }

        if (dryRun) {
            return res.status(200).json({
                dryRun: true,
                wouldClear: toClear.length,
                companies: toClear,
                batches: Math.ceil(toClear.length / BATCH_SIZE) || 0,
            });
        }

        if (toClear.length === 0) {
            return res.status(200).json({ dryRun: false, cleared: 0, companies: [], batches: 0 });
        }

        const timestamp = new Date().toISOString();
        const data = toClear.map(({ rowNum }) => ({
            range: `${safeSheetName}!${TRACKER_COLUMN.daysAttending}${rowNum}`,
            values: [['']],
        }));

        for (let offset = 0; offset < data.length; offset += BATCH_SIZE) {
            const chunk = data.slice(offset, offset + BATCH_SIZE);
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId,
                requestBody: {
                    valueInputOption: 'USER_ENTERED',
                    data: chunk,
                },
            });
        }

        cache.delete('sheet_data');

        const actorName = formatActorLabel(ctx);
        const idList = toClear.map(c => c.companyId).join('; ');
        const idListForLog = idList.length > 12000 ? `${idList.slice(0, 12000)}…(+truncated)` : idList;
        try {
            await sheets.spreadsheets.values.append({
                spreadsheetId,
                range: 'Logs_DoNotEdit!A:E',
                valueInputOption: 'RAW',
                requestBody: {
                    values: [[
                        timestamp,
                        actorName,
                        'CLEANUP_INVALID_DAYS_ATTENDING',
                        `Cleared column ${TRACKER_COLUMN.daysAttending} for ${toClear.length} row(s): not Registered, or Registered without sponsorship tier (${Math.ceil(toClear.length / BATCH_SIZE)} batch(es))`,
                        idListForLog,
                    ]],
                },
            });
        } catch (logErr) {
            console.warn('Failed to log cleanup-invalid-days-attending:', logErr);
        }

        return res.status(200).json({
            dryRun: false,
            cleared: toClear.length,
            companies: toClear,
            batches: Math.ceil(toClear.length / BATCH_SIZE),
        });
    } catch (error) {
        console.error('cleanup-invalid-days-attending error:', error);
        return res.status(500).json({
            error: 'Cleanup failed',
            details: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}
