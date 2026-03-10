import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleSheetsClient } from '../../../lib/google-sheets';

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    try {
        const sheets = await getGoogleSheetsClient();
        const trackerSpreadsheetId = process.env.SPREADSHEET_ID_2;

        console.log('Scanning for duplicates...');

        // 1. Fetch Tracker Data
        const metadata = await sheets.spreadsheets.get({ spreadsheetId: trackerSpreadsheetId });
        const sheet = metadata.data.sheets?.[0];
        if (!sheet) throw new Error('Tracker sheet not found');
        const sheetName = sheet.properties?.title;

        // Fetch wide range to get relevant fields for comparison
        // A: ID, B: Name, C: Status, F: PIC, J: Remarks
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: trackerSpreadsheetId,
            range: `${sheetName}!A2:J`,
        });
        const rows = response.data.values || [];

        // 2a. Fetch Contacts from Database
        const databaseSpreadsheetId = process.env.SPREADSHEET_ID_1;
        const dbMetadata = await sheets.spreadsheets.get({ spreadsheetId: databaseSpreadsheetId });
        const dbSheet = dbMetadata.data.sheets?.find(s => s.properties?.title?.includes('[AUTOMATION ONLY]'));
        const dbSheetName = dbSheet?.properties?.title;

        const dbResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: databaseSpreadsheetId,
            range: `${dbSheetName}!A2:M`, // Get A: CompanyID and columns for contact info (F:Name to M:Remark)
        });
        const dbRows = dbResponse.data.values || [];

        // Map contacts by Company ID
        const contactsMap = new Map();
        dbRows.forEach((row, index) => {
            const companyId = row[0]?.toString().trim();
            if (!companyId) return;

            if (!contactsMap.has(companyId)) {
                contactsMap.set(companyId, []);
            }

            contactsMap.get(companyId).push({
                uniqueId: `contact-${companyId}-${index}`, // Stable ID for tracking selection
                rowNumber: index + 2,
                name: row[5],  // F
                role: row[6],  // G
                email: row[7], // H
                phone: row[8], // I
                remark: row[12] // M
            });
        });

        // 3. Group by Normalized Name
        const groups = new Map();

        rows.forEach((row, index) => {
            const id = row[0]?.toString().trim();
            const name = row[1]?.toString().trim();

            if (!id || !name) return;

            const normalizedName = name.toLowerCase().replace(/\s+/g, ' ').trim();

            if (!groups.has(normalizedName)) {
                groups.set(normalizedName, []);
            }

            // Store summary for UI
            groups.get(normalizedName).push({
                id,
                name,
                status: row[2] || '', // Column C
                pic: row[5] || '',    // Column F
                remarks: row[9] || '', // Column J
                rowIndex: index + 2,
                confidence: 1.0, // Exact string match after normalization
                contacts: contactsMap.get(id) || [] // Attach contacts
            });
        });

        // 4. Filter for Duplicates
        const duplicates = Array.from(groups.values())
            .filter(group => group.length > 1)
            .map(group => ({
                name: group[0].name, // Representative name
                count: group.length,
                companies: group
            }));

        return res.status(200).json({
            success: true,
            count: duplicates.length,
            duplicates
        });

    } catch (error: any) {
        console.error('Scan Error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Internal Server Error'
        });
    }
}
