const { google } = require('googleapis');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env.local') });

async function checkHeaders() {
    console.log('🔍 Checking column headers...\n');

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

    // Read the first row (headers)
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: mainSpreadsheetId,
        range: `${mainSheetName}!A1:Z1`,
    });

    const headers = response.data.values?.[0] || [];

    console.log('Column Headers:');
    headers.forEach((header, index) => {
        const letter = String.fromCharCode(65 + index); // 0=A, 1=B, etc.
        console.log(`${letter} (${index}): "${header}"`);
    });
}

checkHeaders().catch(console.error);
