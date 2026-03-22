import { sheets_v4 } from 'googleapis';

export async function syncDailyStats(sheets: sheets_v4.Sheets, spreadsheetId: string) {
    try {
        // 1. Get the name of the main Outreach Tracker sheet (usually the first one)
        const trackerMeta = await sheets.spreadsheets.get({ spreadsheetId });
        const trackerSheetName = trackerMeta.data.sheets?.[0].properties?.title;

        if (!trackerSheetName) {
            console.error('[syncDailyStats] Could not determine main sheet name');
            return;
        }

        // 2. Fetch ID (A), contactStatus (C), and relationshipStatus (D)
        const dataRange = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${trackerSheetName}!A2:D`, // Skip header
        });

        const rows = dataRange.data.values || [];

        // 3. Aggregate counts
        // Contact status counts and relationship status counts are independent:
        // a company contributes to one contact bucket AND one relationship bucket.
        let toContact = 0, contacted = 0, toFollowUp = 0, noReply = 0;
        let interested = 0, registered = 0, rejected = 0;
        let total = 0;

        rows.forEach((row) => {
            // Only count if Company ID (row[0]) exists
            if (!row[0] || !row[0].trim()) return;

            total++;

            // contactStatus is column C (index 2)
            const rawContact = (row[2] || '').trim().toLowerCase();
            if (rawContact === 'contacted') contacted++;
            else if (rawContact === 'to follow up') toFollowUp++;
            else if (rawContact === 'no reply') noReply++;
            else toContact++; // blank or 'to contact' both count as To Contact

            // relationshipStatus is column D (index 3)
            const rawRelationship = (row[3] || '').trim().toLowerCase();
            if (rawRelationship === 'interested') interested++;
            else if (rawRelationship === 'registered') registered++;
            else if (rawRelationship === 'rejected') rejected++;
        });

        // Use Singapore timezone for local date string as user is in +08:00
        const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' }); // Yields YYYY-MM-DD

        // 4. Ensure Daily_Stats sheet exists
        const STATS_SHEET_NAME = 'Daily_Stats';
        const hasStatsSheet = trackerMeta.data.sheets?.some(s => s.properties?.title === STATS_SHEET_NAME);

        if (!hasStatsSheet) {
            // Create the sheet
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: {
                    requests: [{
                        addSheet: { properties: { title: STATS_SHEET_NAME } }
                    }]
                }
            });

            // Add headers
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `${STATS_SHEET_NAME}!A1:I1`,
                valueInputOption: 'USER_ENTERED',
                requestBody: {
                    values: [['Date', 'Total', 'To Contact', 'Contacted', 'To Follow Up', 'Interested', 'Registered', 'No Reply', 'Rejected']]
                }
            });
        }

        // 5. Append or Update today's row
        const existingStatsData = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${STATS_SHEET_NAME}!A:A` // Get all dates
        });

        const existingRows = existingStatsData.data.values || [];
        const rowIndex = existingRows.findIndex(row => row[0] === dateStr);

        const newValues = [dateStr, total, toContact, contacted, toFollowUp, interested, registered, noReply, rejected];

        if (rowIndex !== -1) {
            // Update existing row for today (rowIndex is 0-indexed relative to data, but sheets are 1-indexed)
            const targetRow = rowIndex + 1; // Correct row number
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `${STATS_SHEET_NAME}!A${targetRow}:I${targetRow}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [newValues] }
            });
            console.log(`[syncDailyStats] Updated row for ${dateStr}`);
        } else {
            // Append new row
            await sheets.spreadsheets.values.append({
                spreadsheetId,
                range: `${STATS_SHEET_NAME}!A:I`,
                valueInputOption: 'USER_ENTERED',
                insertDataOption: 'INSERT_ROWS',
                requestBody: { values: [newValues] }
            });
            console.log(`[syncDailyStats] Appended new row for ${dateStr}`);
        }
    } catch (error) {
        console.error('[syncDailyStats] Error syncing daily stats:', error);
    }
}
