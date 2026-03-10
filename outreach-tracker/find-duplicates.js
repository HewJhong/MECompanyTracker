const { google } = require('googleapis');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env.local') });

async function findDuplicateCompanies() {
    console.log('🔍 Searching for duplicate companies with different IDs...\n');

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
    const nameMap = new Map(); // name -> Set of IDs

    rows.forEach((row, index) => {
        const companyId = row[0];
        const companyName = row[1];

        if (!companyName || companyName === 'undefined' || companyName === 'Company Name') return;
        if (!companyId || companyId === 'undefined' || companyId === 'No.') return;

        if (!nameMap.has(companyName)) {
            nameMap.set(companyName, new Map());
        }

        const idMap = nameMap.get(companyName);
        if (!idMap.has(companyId)) {
            idMap.set(companyId, []);
        }
        idMap.get(companyId).push(index + 2);
    });

    console.log('Potential Duplicates (Same Name, Different IDs):');
    let found = false;
    nameMap.forEach((idMap, name) => {
        if (idMap.size > 1) {
            found = true;
            console.log(`\n🏢 Company: "${name}"`);
            idMap.forEach((rows, id) => {
                console.log(`   - ID: ${id} (Rows: ${rows.join(', ')})`);
            });
        }
    });

    if (!found) {
        console.log('No duplicate companies with different IDs found in the range sampled.');
    }
}

findDuplicateCompanies().catch(console.error);
