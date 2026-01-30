import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleSheetsClient } from '../../lib/google-sheets';
import { getCommitteeMembers } from '../../lib/committee-members';
import { cache } from '../../lib/cache';

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    try {
        // 1. Check Cache
        const CACHE_KEY = 'sheet_data';
        const cachedData = cache.get(CACHE_KEY);

        if (cachedData) {
            res.setHeader('X-Cache', 'HIT');
            return res.status(200).json(cachedData);
        }

        // 2. Fetch from Google Sheets
        const sheets = await getGoogleSheetsClient();
        const spreadsheetId = process.env.SPREADSHEET_ID;

        // Get the first sheet automatically
        const metadata = await sheets.spreadsheets.get({ spreadsheetId });
        const sheetName = metadata.data.sheets?.[0].properties?.title;

        if (!sheetName) throw new Error('No sheet found');

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!A2:Z`, // Skip header, read all columns
        });

        const rows = response.data.values || [];

        // Fetch Thread_History data
        let historyData: any[] = [];
        try {
            const historyResponse = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `Thread_History!A2:D`, // Timestamp, Company, User, Remark
            });
            historyData = (historyResponse.data.values || []).map((row, index) => ({
                id: `history-${index}`,
                timestamp: row[0],
                companyName: row[1],
                user: row[2],
                action: row[3] || '',
                remark: row[3] || ''
            }));
        } catch (error) {
            console.warn('Thread_History sheet not found or empty:', error);
        }

        // 3. Transform & Group
        // We group by Company Name (Col B / Index 1)
        const companyMap = new Map();

        rows.forEach((row, index) => {
            const companyName = row[1];
            if (!companyName) return; // Skip rows without empty company name

            if (!companyMap.has(companyName)) {
                companyMap.set(companyName, {
                    id: companyName, // Using Name as ID for now
                    companyName: companyName,
                    // Common fields (taking from first occurrence)
                    discipline: row[2],
                    priority: row[3],
                    status: row[4],
                    pic: row[13], // Committee Member
                    lastUpdated: row[14],
                    isFlagged: row[15] === 'TRUE',
                    contacts: []
                });
            }

            // Add contact details from this row
            const company = companyMap.get(companyName);
            company.contacts.push({
                id: `contact-${index + 2}`, // Generate a unique ID based on row number
                rowNumber: index + 2, // 1-based index (A2 is row 2)
                picName: row[6],
                email: row[7],
                phone: row[8],
                linkedin: row[10],
                remark: row[12]
            });
        });

        const data = Array.from(companyMap.values());

        // Add history to each company
        data.forEach(company => {
            company.history = historyData.filter(h => h.companyName === company.companyName);
        });

        let committeeMembers: { name: string; email: string; role: string }[] = [];
        try {
            committeeMembers = await getCommitteeMembers();
        } catch (e) {
            console.warn('Committee_Members not loaded:', e);
        }

        // 4. Update Cache
        const responseData = {
            companies: data,
            history: historyData,
            committeeMembers,
        };
        cache.set(CACHE_KEY, responseData);

        res.setHeader('X-Cache', 'MISS');
        res.status(200).json(responseData);

    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
}
