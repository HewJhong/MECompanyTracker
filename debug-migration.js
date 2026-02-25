const { google } = require('googleapis');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env.local') });

async function debugMigration() {
    console.log('🔍 Debugging migration data...\n');

    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: privateKey,
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    const mainSpreadsheetId = process.env.SPREADSHEET_ID_1;
    const mainMetadata = await sheets.spreadsheets.get({ spreadsheetId: mainSpreadsheetId });
    const mainSheetName = mainMetadata.data.sheets?.find((sheet) =>
        sheet.properties?.title?.includes('[AUTOMATION ONLY]')
    )?.properties?.title || mainMetadata.data.sheets?.[0].properties?.title;

    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: mainSpreadsheetId,
        range: `${mainSheetName}!A2:B`,
    });

    const rows = response.data.values || [];

    let validCount = 0;
    let skippedCount = 0;
    const skippedReasons = {};
    const companyIds = new Set();
    const companyNames = new Set();

    rows.forEach((row, index) => {
        const companyId = row[0];
        const companyName = row[1];

        let reason = null;

        if (!companyId || !companyName) {
            reason = 'Empty ID or Name';
        } else if (companyId === 'No.' || companyName === 'Company Name') {
            reason = 'Header row';
        } else if (companyId.toString().toLowerCase().includes('legend')) {
            reason = 'Legend in ID';
        } else if (companyName.toString().toLowerCase().includes('legend')) {
            reason = 'Legend in Name';
        } else if (companyId === 'undefined' || companyName === 'undefined') {
            reason = 'Undefined value';
        }

        if (reason) {
            skippedCount++;
            skippedReasons[reason] = (skippedReasons[reason] || 0) + 1;
            if (skippedCount <= 10) {
                console.log(`Row ${index + 2}: SKIPPED - ${reason} (ID="${companyId}", Name="${companyName}")`);
            }
        } else {
            validCount++;
            companyIds.add(companyId);
            companyNames.add(companyName);
        }
    });

    console.log(`\n📊 Summary:`);
    console.log(`   Total rows: ${rows.length}`);
    console.log(`   Valid companies: ${validCount}`);
    console.log(`   Unique Company IDs: ${companyIds.size}`);
    console.log(`   Unique Company Names: ${companyNames.size}`);
    console.log(`   Skipped rows: ${skippedCount}`);
    console.log(`\n   Skip reasons:`);
    Object.entries(skippedReasons).forEach(([reason, count]) => {
        console.log(`     - ${reason}: ${count}`);
    });

    // Show Company ID range
    const idArray = Array.from(companyIds);
    const numericIds = idArray.filter(id => !isNaN(id)).map(Number).sort((a, b) => a - b);
    if (numericIds.length > 0) {
        console.log(`\n   Numeric ID range: ${numericIds[0]} to ${numericIds[numericIds.length - 1]}`);
        console.log(`   Sample IDs: ${numericIds.slice(0, 10).join(', ')}${numericIds.length > 10 ? '...' : ''}`);
    }
}

debugMigration().catch(console.error);
