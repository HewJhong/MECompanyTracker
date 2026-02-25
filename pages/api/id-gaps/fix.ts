import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleSheetsClient } from '../../../lib/google-sheets';
import { cache } from '../../../lib/cache';

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    try {
        const sheets = await getGoogleSheetsClient();
        const databaseSpreadsheetId = process.env.SPREADSHEET_ID_1;
        const trackerSpreadsheetId = process.env.SPREADSHEET_ID_2;

        // 1. Fetch Data
        // Database
        const dbMetadata = await sheets.spreadsheets.get({ spreadsheetId: databaseSpreadsheetId });
        const dbSheet = dbMetadata.data.sheets?.find(sheet =>
            sheet.properties?.title?.includes('[AUTOMATION ONLY]')
        );
        const dbSheetName = dbSheet?.properties?.title;
        if (!dbSheetName) throw new Error('Company Database sheet not found');

        const dbResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: databaseSpreadsheetId,
            range: `${dbSheetName}!A2:A`,
        });
        const dbRows = dbResponse.data.values || []; // Array of [ID]

        // Tracker
        const trackerMetadata = await sheets.spreadsheets.get({ spreadsheetId: trackerSpreadsheetId });
        const trackerSheetName = trackerMetadata.data.sheets?.[0].properties?.title;
        if (!trackerSheetName) throw new Error('Outreach Tracker sheet not found');

        const trackerResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: trackerSpreadsheetId,
            range: `${trackerSheetName}!A2:A`,
        });
        const trackerRows = trackerResponse.data.values || []; // Array of [ID]

        // 2. Calculate Renumbering Map
        const uniqueIds = new Set<string>();
        dbRows.forEach(row => {
            if (row[0]) uniqueIds.add(row[0]);
        });

        // Sort IDs numerically
        const sortedIds = Array.from(uniqueIds).sort((a, b) => {
            const numA = parseInt(a.match(/ME-(\d+)/)?.[1] || '0', 10);
            const numB = parseInt(b.match(/ME-(\d+)/)?.[1] || '0', 10);
            return numA - numB;
        });

        const idMap = new Map<string, string>(); // Old -> New
        const changes: { oldId: string; newId: string }[] = [];

        sortedIds.forEach((oldId, index) => {
            const newNum = index + 1;
            const newId = `ME-${String(newNum).padStart(4, '0')}`;

            if (oldId !== newId) {
                idMap.set(oldId, newId);
                changes.push({ oldId, newId });
            }
        });

        if (changes.length === 0) {
            return res.status(200).json({ success: true, message: 'No gaps to fix', changes: [] });
        }

        // 3. Prepare Updates

        // Update Database Rows
        const newDbRows = dbRows.map(row => {
            const id = row[0];
            if (id && idMap.has(id)) {
                return [idMap.get(id)];
            }
            return row; // Keep original if not remapped (or empty)
        });

        // Update Tracker Rows
        const newTrackerRows = trackerRows.map(row => {
            const id = row[0];
            if (id && idMap.has(id)) {
                return [idMap.get(id)];
            }
            return row;
        });

        // 4. Perform Updates
        await Promise.all([
            sheets.spreadsheets.values.update({
                spreadsheetId: databaseSpreadsheetId,
                range: `${dbSheetName}!A2:A${newDbRows.length + 1}`,
                valueInputOption: 'RAW',
                requestBody: { values: newDbRows },
            }),
            sheets.spreadsheets.values.update({
                spreadsheetId: trackerSpreadsheetId,
                range: `${trackerSheetName}!A2:A${newTrackerRows.length + 1}`,
                valueInputOption: 'RAW',
                requestBody: { values: newTrackerRows },
            })
        ]);

        // 5. Clear Cache
        cache.clear();

        return res.status(200).json({
            success: true,
            changesCount: changes.length,
            changes: changes.slice(0, 50), // Return partial list
            totalRenumbered: changes.length
        });

    } catch (error) {
        console.error('Fix gaps failed:', error);
        return res.status(500).json({ message: 'Failed to fix ID gaps' });
    }
}
