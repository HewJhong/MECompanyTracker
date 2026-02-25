require('dotenv').config({ path: '.env.local' });
const { google } = require('googleapis');

async function listSheets() {
    try {
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            },
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.SPREADSHEET_ID_2;

        if (!spreadsheetId) {
            console.error('SPREADSHEET_ID_2 not found in .env.local');
            return;
        }

        const metadata = await sheets.spreadsheets.get({ spreadsheetId });
        const sheetNames = metadata.data.sheets.map(s => s.properties.title);

        console.log('Available Sheets:', sheetNames);
    } catch (error) {
        console.error('Error:', error);
    }
}

listSheets();
