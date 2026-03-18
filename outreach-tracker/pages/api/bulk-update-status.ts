import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleSheetsClient } from '../../lib/google-sheets';
import { cache } from '../../lib/cache';
import { formatActorLabel, requireEffectiveAdmin } from '../../lib/authz';

const ALLOWED_STATUSES = ['To Contact', 'Contacted', 'To Follow Up', 'Interested', 'Registered', 'Rejected', 'No Reply'] as const;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const ctx = await requireEffectiveAdmin(req, res);
        if (!ctx) return;

        const { companyIds, status } = req.body as { companyIds?: string[]; status?: string };

        if (!Array.isArray(companyIds) || companyIds.length === 0) {
            return res.status(400).json({ error: 'Invalid or empty companyIds array' });
        }
        if (!status || typeof status !== 'string' || !ALLOWED_STATUSES.includes(status as typeof ALLOWED_STATUSES[number])) {
            return res.status(400).json({
                error: 'Invalid status',
                allowed: ALLOWED_STATUSES,
            });
        }

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
            range: `${safeSheetName}!A:N`,
        });

        const rows = (dataResponse.data.values || []) as string[][];
        if (rows.length === 0) {
            return res.status(404).json({ error: 'No data found in sheet' });
        }

        const headers = rows[0].map((h: string) => String(h || '').toLowerCase().trim());
        const statusColumnIndex = headers.findIndex((h: string) => h === 'status');
        const lastUpdatedColumnIndex = headers.findIndex((h: string) =>
            h === 'last updated' || h === 'last update' || h === 'updated'
        );

        if (statusColumnIndex === -1) {
            return res.status(500).json({
                error: 'Status column not found',
                details: `Headers: ${headers.join(', ')}`,
            });
        }

        const timestamp = new Date().toISOString();
        const updates: { range: string; values: string[][] }[] = [];
        const successfulIds: string[] = [];

        for (const companyId of companyIds) {
            const rowIndex = rows.findIndex(row => row[0] === companyId);
            if (rowIndex > 0) {
                const rowNum = rowIndex + 1;
                updates.push({
                    range: `${safeSheetName}!${String.fromCharCode(65 + statusColumnIndex)}${rowNum}`,
                    values: [[status]],
                });
                if (lastUpdatedColumnIndex !== -1) {
                    updates.push({
                        range: `${safeSheetName}!${String.fromCharCode(65 + lastUpdatedColumnIndex)}${rowNum}`,
                        values: [[timestamp]],
                    });
                }
                successfulIds.push(companyId);
            }
        }

        if (updates.length === 0) {
            return res.status(404).json({ error: 'No matching companies found' });
        }

        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: {
                valueInputOption: 'USER_ENTERED',
                data: updates,
            },
        });

        cache.delete('sheet_data');

        const actorName = formatActorLabel(ctx);
        try {
            await sheets.spreadsheets.values.append({
                spreadsheetId,
                range: 'Thread_History!A:D',
                valueInputOption: 'USER_ENTERED',
                requestBody: {
                    values: successfulIds.map(id => [
                        timestamp,
                        id,
                        actorName,
                        `Bulk status update to "${status}" (from All Companies)`,
                    ]),
                },
            });
        } catch (logErr) {
            console.warn('Failed to write bulk status to Thread_History:', logErr);
        }

        try {
            await sheets.spreadsheets.values.append({
                spreadsheetId,
                range: 'Logs_DoNotEdit!A:E',
                valueInputOption: 'RAW',
                requestBody: {
                    values: [[
                        timestamp,
                        actorName,
                        'BULK_UPDATE_STATUS',
                        `Set status to "${status}" for ${successfulIds.length} companies`,
                        successfulIds.join('; '),
                    ]],
                },
            });
        } catch (logErr) {
            console.warn('Failed to log bulk status update:', logErr);
        }

        return res.status(200).json({
            success: true,
            updated: successfulIds.length,
            companyIds: successfulIds,
        });
    } catch (error) {
        console.error('Bulk update status error:', error);
        return res.status(500).json({
            error: 'Failed to update status',
            details: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}
