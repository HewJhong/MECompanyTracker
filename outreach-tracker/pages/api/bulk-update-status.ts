import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../lib/auth';
import { getCommitteeMembers } from '../../lib/committee-members';
import { getGoogleSheetsClient } from '../../lib/google-sheets';
import { cache } from '../../lib/cache';

const CONTACT_STATUSES = ['To Contact', 'Contacted', 'To Follow Up', 'No Reply'] as const;
const RELATIONSHIP_STATUSES = ['Interested', 'Registered', 'Rejected'] as const;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const session = await getServerSession(req, res, authOptions);
        if (!session?.user?.email) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const members = await getCommitteeMembers();
        const userEmail = session.user.email.toLowerCase().trim();
        const user = members.find(m => m.email.toLowerCase().trim() === userEmail);
        const roleLower = user?.role?.toLowerCase() || '';
        if (!user || (roleLower !== 'admin' && roleLower !== 'superadmin')) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { companyIds, field, value } = req.body as { companyIds?: string[]; field?: string; value?: string };

        if (!Array.isArray(companyIds) || companyIds.length === 0) {
            return res.status(400).json({ error: 'Invalid or empty companyIds array' });
        }
        if (!field || (field !== 'contactStatus' && field !== 'relationshipStatus')) {
            return res.status(400).json({ error: 'Invalid field. Must be "contactStatus" or "relationshipStatus"' });
        }
        const allowedValues = field === 'contactStatus' ? CONTACT_STATUSES : RELATIONSHIP_STATUSES;
        if (!value || typeof value !== 'string' || !allowedValues.includes(value as never)) {
            return res.status(400).json({
                error: `Invalid value for ${field}`,
                allowed: allowedValues,
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
        const targetHeader = field === 'contactStatus' ? 'contact status' : 'relationship status';
        const statusColumnIndex = headers.findIndex((h: string) => h === targetHeader);
        const lastUpdatedColumnIndex = headers.findIndex((h: string) =>
            h === 'last updated' || h === 'last update' || h === 'updated'
        );

        if (statusColumnIndex === -1) {
            return res.status(500).json({
                error: `Column "${targetHeader}" not found`,
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
                    values: [[value]],
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

        const actorName = session.user.name || session.user.email || 'Admin';
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
                        `Bulk ${field} update to "${value}" (from All Companies)`,
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
                        `Set ${field} to "${value}" for ${successfulIds.length} companies`,
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
