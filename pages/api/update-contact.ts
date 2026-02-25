import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../lib/auth';
import { getCommitteeMembers } from '../../lib/committee-members';
import { getGoogleSheetsClient } from '../../lib/google-sheets';
import { cache } from '../../lib/cache';

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.email) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    const members = await getCommitteeMembers();
    const email = session.user.email.toLowerCase().trim();
    const committeeUser = members.find(m => m.email.toLowerCase().trim() === email);
    if (!committeeUser) {
        return res.status(403).json({ message: 'Not authorized to modify data' });
    }

    const { rowNumber, updates, user, companyId, historyLog } = req.body;

    if (!rowNumber || !user || !companyId) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    try {
        const sheets = await getGoogleSheetsClient();
        const spreadsheetId = process.env.SPREADSHEET_ID_1;

        if (!spreadsheetId) {
            throw new Error('SPREADSHEET_ID_1 is not configured');
        }

        const metadata = await sheets.spreadsheets.get({ spreadsheetId });
        const dbSheet = metadata.data.sheets?.find(s => s.properties?.title?.includes('[AUTOMATION ONLY]'));
        const sheetName = dbSheet?.properties?.title || metadata.data.sheets?.[0].properties?.title;

        const CONTACT_COL_MAP: Record<string, string> = {
            'picName': 'F',
            'role': 'G',
            'email': 'H',
            'phone': 'I',
            'linkedin': 'K',
            'remark': 'M',
            'isActive': 'N'
        };

        const valueUpdates: any[] = [];

        Object.entries(updates).forEach(([key, value]) => {
            if (CONTACT_COL_MAP[key]) {
                const val = (key === 'isActive') ? (value ? 'TRUE' : 'FALSE') : value;
                valueUpdates.push({
                    range: `${sheetName}!${CONTACT_COL_MAP[key]}${rowNumber}`,
                    values: [[val]]
                });
            }
        });

        if (valueUpdates.length > 0) {
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId,
                requestBody: {
                    valueInputOption: 'USER_ENTERED',
                    data: valueUpdates
                }
            });
        }

        const spreadsheetId2 = process.env.SPREADSHEET_ID_2;
        if (spreadsheetId2) {
            const timestamp = new Date().toISOString();
            const logSheetName = 'Logs_DoNotEdit';
            await sheets.spreadsheets.values.append({
                spreadsheetId: spreadsheetId2,
                range: `${logSheetName}!A:E`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[timestamp, user, companyId, 'Contact Update', JSON.stringify(updates)]] }
            });

            if (historyLog) {
                await sheets.spreadsheets.values.append({
                    spreadsheetId: spreadsheetId2,
                    range: `Thread_History!A:D`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: [[timestamp, companyId, user, historyLog]] }
                });
            }
        }

        cache.delete('sheet_data');

        res.status(200).json({ success: true });

    } catch (error) {
        console.error('Contact Update Error:', error);
        res.status(500).json({ message: 'Update Failed' });
    }
}
