const { google } = require('googleapis');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env.local') });

async function findAllCompanies() {
    console.log('🔍 Finding ALL company rows including those without IDs...\n');

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

    let withId = 0;
    let withoutId = 0;
    let withNameNoId = [];
    let totalValid = 0;

    rows.forEach((row, index) => {
        const companyId = row[0];
        const companyName = row[1];

        // Skip completely empty rows
        if (!companyId && !companyName) return;

        // Skip header
        if (companyId === 'No.' || companyName === 'Company Name') return;

        // Skip legend rows
        if (companyId?.toString().toLowerCase().includes('legend')) return;
        if (companyName?.toString().toLowerCase().includes('legend')) return;

        // If has company name but no ID
        if (companyName && companyName !== 'undefined' && (!companyId || companyId === 'undefined')) {
            withoutId++;
            if (withNameNoId.length < 25) {
                withNameNoId.push({
                    row: index + 2,
                    name: companyName
                });
            }
        }

        // If has both ID and name
        if (companyId && companyId !== 'undefined' && companyName && companyName !== 'undefined') {
            withId++;
        }

        totalValid++;
    });

    console.log(`📊 Analysis:`);
    console.log(`   Total valid rows (excluding empty/header/legend): ${totalValid}`);
    console.log(`   Companies WITH ID: ${withId}`);
    console.log(`   Companies WITHOUT ID (but have name): ${withoutId}`);
    console.log(`   Expected total if we include companies without ID: ${withId + withoutId}`);

    if (withNameNoId.length > 0) {
        console.log(`\n📋 First ${Math.min(25, withNameNoId.length)} companies without Company ID:`);
        withNameNoId.forEach(c => {
            console.log(`   Row ${c.row}: Name="${c.name}"`);
        });
    }

    console.log(`\n💡 Difference from target 670: ${670 - (withId + withoutId)} companies`);
}

findAllCompanies().catch(console.error);
