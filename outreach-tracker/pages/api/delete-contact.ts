import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleSheetsClient } from '../../lib/google-sheets';
import { getCompanyDatabaseSheet } from '../../lib/spreadsheet-utils';
import { cache } from '../../lib/cache';
import { requireEffectiveCanEditCompanies } from '../../lib/authz';
import { formatActorLabel } from '../../lib/authz';

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const ctx = await requireEffectiveCanEditCompanies(req, res);
    if (!ctx) return;

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
        const { title: sheetName, sheetId } = getCompanyDatabaseSheet(metadata.data.sheets);

        const rowData = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!A${rowNumber}:O${rowNumber}`,
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

        const companyColA = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!A:A`,
        });
        const allIds = companyColA.data.values || [];
        const companyRowCount = allIds.filter(r => r[0] === companyId).length;

        if (companyRowCount > 1) {
            if (sheetId === undefined) {
                throw new Error('Sheet ID required for row deletion but not available');
            }
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: {
                    requests: [
                        {
                            deleteDimension: {
                                range: {
                                    sheetId,
                                    dimension: 'ROWS',
                                    startIndex: rowNumber - 1,
                                    endIndex: rowNumber,
                                },
                            },
                        },
                    ],
                },
            });
        } else {
            // Last row for this company — clear contact fields (F:P) to preserve the company base row
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `${sheetName}!F${rowNumber}:P${rowNumber}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: {
                    values: [['', '', '', '', '', '', '', '', 'FALSE', '', '']],
                },
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
                requestBody: { values: [[timestamp, formatActorLabel(ctx), 'CONTACT_DELETED', `${companyId} – deleted contact row ${rowNumber}`, JSON.stringify(contactDetails)]] }
            });

            await sheets.spreadsheets.values.append({
                spreadsheetId: spreadsheetId2,
                range: `Thread_History!A:D`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[timestamp, companyId, formatActorLabel(ctx), historyLog || `Deleted contact row ${rowNumber}`]] }
            });
        }

        cache.delete('sheet_data');

        res.status(200).json({ success: true });

    } catch (error) {
        console.error('Delete Contact Error:', error);
        res.status(500).json({ message: 'Deletion Failed' });
    }
}
