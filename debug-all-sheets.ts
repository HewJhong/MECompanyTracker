import { getGoogleSheetsClient } from './lib/google-sheets';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function debugAllSheets() {
    try {
        const sheets = await getGoogleSheetsClient();
        const databaseSpreadsheetId = process.env.SPREADSHEET_ID_1;
        const trackerSpreadsheetId = process.env.SPREADSHEET_ID_2;

        console.log('=== MASTER DATABASE (SPREADSHEET_ID_1) ===\n');
        const dbMetadata = await sheets.spreadsheets.get({ spreadsheetId: databaseSpreadsheetId });

        if (dbMetadata.data.sheets) {
            for (const sheet of dbMetadata.data.sheets) {
                const title = sheet.properties?.title;
                console.log(`Sheet: "${title}"`);

                // Read first 3 rows to see headers and sample data
                const res = await sheets.spreadsheets.values.get({
                    spreadsheetId: databaseSpreadsheetId,
                    range: `${title}!A1:Z3`
                });

                if (res.data.values && res.data.values.length > 0) {
                    console.log('  Row 1 (Header?):', res.data.values[0]);
                    if (res.data.values.length > 1) {
                        console.log('  Row 2:', res.data.values[1]?.slice(0, 5), '...');
                    }
                } else {
                    console.log('  [EMPTY SHEET]');
                }
                console.log('');
            }
        }

        console.log('\n=== OUTREACH TRACKER (SPREADSHEET_ID_2) ===\n');
        const trackerMetadata = await sheets.spreadsheets.get({ spreadsheetId: trackerSpreadsheetId });

        if (trackerMetadata.data.sheets) {
            for (const sheet of trackerMetadata.data.sheets) {
                const title = sheet.properties?.title;
                console.log(`Sheet: "${title}"`);

                const res = await sheets.spreadsheets.values.get({
                    spreadsheetId: trackerSpreadsheetId,
                    range: `${title}!A1:Z3`
                });

                if (res.data.values && res.data.values.length > 0) {
                    console.log('  Row 1 (Header?):', res.data.values[0]);
                    if (res.data.values.length > 1) {
                        console.log('  Row 2:', res.data.values[1]?.slice(0, 5), '...');
                    }
                } else {
                    console.log('  [EMPTY SHEET]');
                }
                console.log('');
            }
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

debugAllSheets();
