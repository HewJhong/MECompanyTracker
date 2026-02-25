const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const { google } = require('googleapis');

async function testConnection() {
    console.log('Testing Google Sheets Connection...');
    console.log('Using Spreadsheet ID:', process.env.SPREADSHEET_ID);
    console.log('Service Account:', process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);

    try {
        const privateKey = process.env.GOOGLE_PRIVATE_KEY
            ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
            : undefined;

        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                private_key: privateKey,
            },
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const client = await auth.getClient();
        const sheets = google.sheets({ version: 'v4', auth: client });

        // Debugging Key Format (Safe-ish)
        if (privateKey) {
            console.log('DEBUG: Private Key Length:', privateKey.length);
            console.log('DEBUG: Starts with Header?', privateKey.trim().startsWith('-----BEGIN PRIVATE KEY-----'));
            console.log('DEBUG: Ends with Footer?', privateKey.trim().endsWith('-----END PRIVATE KEY-----'));
            console.log('DEBUG: Contains actual newlines?', privateKey.includes('\n'));
        } else {
            console.log('DEBUG: Private Key is undefined!');
        }

        const response = await sheets.spreadsheets.get({
            spreadsheetId: process.env.SPREADSHEET_ID,
        });

        console.log('SUCCESS! Connected to Sheet.');
        console.log('Sheet Title:', response.data.properties.title);

    } catch (error) {
        console.error('CONNECTION FAILED:');
        console.error(error.message);
    }
}

testConnection();
