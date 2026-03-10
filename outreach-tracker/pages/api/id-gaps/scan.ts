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
        const databaseSpreadsheetId = process.env.SPREADSHEET_ID_1; // Company Database

        // Fetch Company Database
        const dbMetadata = await sheets.spreadsheets.get({ spreadsheetId: databaseSpreadsheetId });
        const dbSheet = dbMetadata.data.sheets?.find(sheet =>
            sheet.properties?.title?.includes('[AUTOMATION ONLY]')
        );
        const dbSheetName = dbSheet?.properties?.title;

        if (!dbSheetName) {
            throw new Error('Company Database sheet with [AUTOMATION ONLY] label not found');
        }

        const dbResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: databaseSpreadsheetId,
            range: `${dbSheetName}!A2:A`, // Only need Company IDs
        });

        const dbRows = dbResponse.data.values || [];

        // Extract unique IDs
        const ids = new Set<string>();
        dbRows.forEach(row => {
            if (row[0]) ids.add(row[0]);
        });

        const numericIds = Array.from(ids)
            .map(id => {
                const match = id.match(/ME-(\d+)/);
                return match ? parseInt(match[1], 10) : 0;
            })
            .filter(id => id > 0)
            .sort((a, b) => a - b);

        if (numericIds.length === 0) {
            return res.status(200).json({
                success: true,
                gaps: {
                    missingIds: [],
                    count: 0,
                    minId: 0,
                    maxId: 0,
                    totalCompanies: 0
                }
            });
        }

        const minId = numericIds[0];
        const maxId = numericIds[numericIds.length - 1];
        const missingIds: string[] = [];

        // Find gaps
        for (let i = minId; i <= maxId; i++) {
            if (!numericIds.includes(i)) {
                missingIds.push(`ME-${String(i).padStart(4, '0')}`);
            }
        }

        return res.status(200).json({
            success: true,
            gaps: {
                missingIds,
                count: missingIds.length,
                minId,
                maxId,
                totalCompanies: ids.size
            }
        });

    } catch (error) {
        console.error('Scan failed:', error);
        return res.status(500).json({ message: 'Failed to scan for ID gaps' });
    }
}
