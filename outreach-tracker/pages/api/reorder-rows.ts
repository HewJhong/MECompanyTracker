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
    const roleLower = committeeUser?.role?.toLowerCase() || '';
    const canEditCompanies = committeeUser && (roleLower === 'admin' || roleLower === 'superadmin' || roleLower === 'member' || roleLower === 'committee member');
    if (!canEditCompanies) {
        return res.status(403).json({ message: 'Not authorized to modify data' });
    }

    try {
        const sheets = await getGoogleSheetsClient();
        const databaseSpreadsheetId = process.env.SPREADSHEET_ID_1;

        if (!databaseSpreadsheetId) {
            throw new Error('SPREADSHEET_ID_1 is not configured');
        }

        // 1. Get metadata to find the correct sheet
        const dbMetadata = await sheets.spreadsheets.get({ spreadsheetId: databaseSpreadsheetId });
        const dbSheet = dbMetadata.data.sheets?.find(s => s.properties?.title?.includes('[AUTOMATION ONLY]'));
        const sheetName = dbSheet?.properties?.title;

        if (!sheetName) {
            throw new Error('Could not find the [AUTOMATION ONLY] sheet');
        }

        const sheetId = dbSheet.properties?.sheetId;

        // 2. Fetch existing rows (excluding header)
        const dbResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: databaseSpreadsheetId,
            range: `${sheetName}!A2:N`,
        });

        const rows = dbResponse.data.values || [];

        if (rows.length === 0) {
            return res.status(200).json({ success: true, message: 'No rows to sort' });
        }

        // 3. Sort the rows by Company ID (Column A, which is rows[i][0])
        const sortedRows = [...rows].sort((a, b) => {
            const idA = a[0] ? String(a[0]).trim() : '';
            const idB = b[0] ? String(b[0]).trim() : '';
            return idA.localeCompare(idB);
        });

        // 4. Update the sheet via batchUpdate (Clear and Append is risky, UpdateCells is safer, but basic Update range is best)
        // We update A2:N to overwrite everything below the header
        await sheets.spreadsheets.values.update({
            spreadsheetId: databaseSpreadsheetId,
            range: `${sheetName}!A2:N`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: sortedRows
            }
        });

        // Optional: clear any trailing rows if the sortedRows length is smaller somehow (unlikely since we just reordered)

        // Clear cache so frontend fetches new order
        cache.delete('sheet_data');
        cache.delete('company_database');

        res.status(200).json({
            success: true,
            message: `Successfully reordered ${sortedRows.length} rows.`
        });

    } catch (error: any) {
        console.error('Reorder Rows API Error:', error);
        res.status(500).json({ message: error.message || 'Internal Server Error' });
    }
}
