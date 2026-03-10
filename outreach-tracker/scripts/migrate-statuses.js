/**
 * Migration Script: Update Statuses
 * 
 * Changes:
 * 1. "Completed" -> "Registered"
 * 2. "Negotiating" -> "Interested"
 * 
 * Usage:
 *   nvm use 20 && node scripts/migrate-statuses.js
 */

const { google } = require('googleapis');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from the parent directory
dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function getGoogleSheetsClient() {
    const scopes = ['https://www.googleapis.com/auth/spreadsheets'];
    const privateKey = process.env.GOOGLE_PRIVATE_KEY
        ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
        : undefined;

    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: privateKey,
        },
        scopes,
    });

    return google.sheets({ version: 'v4', auth: await auth.getClient() });
}

async function migrateStatuses() {
    console.log('🚀 Starting Status Migration...');

    // 1. Setup
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = process.env.SPREADSHEET_ID_2; // Tracker Sheet
    if (!spreadsheetId) throw new Error('Missing SPREADSHEET_ID_2');

    // 2. Get Sheet Name
    const metadata = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetName = metadata.data.sheets[0].properties.title;
    console.log(`   Target Sheet: ${sheetName}`);

    // 3. Read Data (Column C is Status, index 2)
    // We read the whole sheet to be safe, but primarily we need Column C.
    // However, to ensure we don't mess up rows, we'll read A:Z.
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A:Z`,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
        console.log('   No data found.');
        return;
    }

    // 4. Find Status Column Index
    const header = rows[0];
    const statusIndex = header.findIndex(h => h && h.trim().toLowerCase() === 'status');
    const finalStatusIndex = statusIndex !== -1 ? statusIndex : 2; // Default to 2 if not found
    console.log(`   Status Column Index: ${finalStatusIndex} ("${header[finalStatusIndex] || 'Unknown'}")`);

    // 5. Process Rows
    let updatesCount = 0;
    const updates = [];

    // Start from row 1 if headers exist, or row 0 if it's data
    const startRow = (header[0] === 'Company ID' || header[0] === 'ME-0001') ? 1 : 0;

    for (let i = startRow; i < rows.length; i++) {
        const row = rows[i];
        if (!row[finalStatusIndex]) continue;

        const currentStatus = row[finalStatusIndex].trim();
        let newStatus = null;

        if (currentStatus === 'Completed') {
            newStatus = 'Registered';
        } else if (currentStatus === 'Negotiating') {
            newStatus = 'Interested';
        }

        if (newStatus) {
            updates.push({
                range: `${sheetName}!${String.fromCharCode(65 + finalStatusIndex)}${i + 1}`,
                values: [[newStatus]]
            });
            updatesCount++;
        }
    }

    console.log(`   Found ${updatesCount} rows to update.`);

    if (updatesCount > 0) {
        // 6. Batch Update
        // Google Sheets API has a limit on requests, but batchUpdate is one request.
        // However, `values.batchUpdate` takes a list of valueRanges.

        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: {
                valueInputOption: 'USER_ENTERED',
                data: updates
            }
        });
        console.log('   ✅ Migration successful!');
    } else {
        console.log('   No changes needed.');
    }
}

migrateStatuses().catch(console.error);
