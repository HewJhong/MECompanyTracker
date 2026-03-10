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

    const { rowNumber, companyId, user, historyLog } = req.body;

    if (!rowNumber || !companyId || !user) {
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
        const sheetId = dbSheet?.properties?.sheetId;
        const sheetName = dbSheet?.properties?.title || metadata.data.sheets?.[0].properties?.title;

        const rowData = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!A${rowNumber}:N${rowNumber}`,
        });

        const values = rowData.data.values?.[0] || [];
        const existingId = values[0];

        if (existingId !== companyId) {
            return res.status(400).json({ message: 'Row does not match Company ID' });
        }

        const contactDetails = {
            deletedRow: rowNumber,
            name: values[5] || '',
            role: values[6] || '',
            email: values[7] || '',
            phone: values[8] || '',
            linkedin: values[10] || '',
            remark: values[12] || '',
            isActive: values[13] || ''
        };

        await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
                requests: [
                    {
                        deleteDimension: {
                            range: {
                                sheetId: sheetId,
                                dimension: 'ROWS',
                                startIndex: rowNumber - 1,
                                endIndex: rowNumber,
                            },
                        },
                    },
                ],
            },
        });

        const spreadsheetId2 = process.env.SPREADSHEET_ID_2;
        if (spreadsheetId2) {
            const timestamp = new Date().toISOString();
            const logSheetName = 'Logs_DoNotEdit';
            await sheets.spreadsheets.values.append({
                spreadsheetId: spreadsheetId2,
                range: `${logSheetName}!A:E`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[timestamp, user, companyId, 'Contact Deletion', JSON.stringify(contactDetails)]] }
            });

            await sheets.spreadsheets.values.append({
                spreadsheetId: spreadsheetId2,
                range: `Thread_History!A:D`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[timestamp, companyId, user, historyLog || `Deleted contact row ${rowNumber}`]] }
            });
        }

        cache.delete('sheet_data');

        res.status(200).json({ success: true });

    } catch (error) {
        console.error('Delete Contact Error:', error);
        res.status(500).json({ message: 'Deletion Failed' });
    }
}
