
import { getGoogleSheetsClient } from './lib/google-sheets';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function debugColumns() {
    try {
        const sheets = await getGoogleSheetsClient();
        const databaseSpreadsheetId = process.env.SPREADSHEET_ID_1;
        const trackerSpreadsheetId = process.env.SPREADSHEET_ID_2;

        console.log('--- Debugging Columns (All Sheets) ---');

        // 1. Inspect Master Database (Original Sheet)
        console.log('\n[Master Database]');
        const dbMetadata = await sheets.spreadsheets.get({ spreadsheetId: databaseSpreadsheetId });

        console.log(`Total Sheets: ${dbMetadata.data.sheets?.length}`);

        if (dbMetadata.data.sheets) {
            for (const sheet of dbMetadata.data.sheets) {
                const title = sheet.properties?.title;
                console.log(`\nChecking Sheet: "${title}"`);

                if (!title?.includes('[AUTOMATION ONLY]')) {
                    console.log('  -> MATCHES FILTER (Not [AUTOMATION ONLY])');
                }

                const res = await sheets.spreadsheets.values.get({
                    spreadsheetId: databaseSpreadsheetId,
                    range: `${title}!A1:Z1`
                });
                console.log('  Headers:', res.data.values?.[0] || 'No headers found');
            }
        }

        // 2. Inspect Outreach Tracker
        console.log('\n[Outreach Tracker]');
        const trackerMetadata = await sheets.spreadsheets.get({ spreadsheetId: trackerSpreadsheetId });
        const trackerSheet = trackerMetadata.data.sheets?.[0]; // Assume first sheet

        if (trackerSheet) {
            const name = trackerSheet.properties?.title;
            console.log(`Sheet Name: ${name}`);
            const res = await sheets.spreadsheets.values.get({
                spreadsheetId: trackerSpreadsheetId,
                range: `${name}!A1:Z1`
            });
            console.log('Headers:', res.data.values?.[0] || 'No headers found');
        } else {
            console.log('Could not find Tracker sheet');
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

debugColumns();
