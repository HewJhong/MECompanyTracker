const { google } = require('googleapis');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function verifySetup() {
    console.log('🔍 Verifying Sheet Setup...\n');

    let privateKey = process.env.GOOGLE_PRIVATE_KEY;
    if (privateKey && privateKey.includes('\\n')) {
        privateKey = privateKey.replace(/\\n/g, '\n');
    }

    if (!privateKey || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
        console.error('❌ Missing Google credentials in .env.local');
        return;
    }

    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: privateKey,
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    const spreadsheetId = process.env.SPREADSHEET_ID_2;
    if (!spreadsheetId) {
        console.error('❌ SPREADSHEET_ID_2 not found in .env.local');
        return;
    }

    const metadata = await sheets.spreadsheets.get({ spreadsheetId });
    const existingSheets = metadata.data.sheets || [];

    console.log(`Spreadsheet ID: ${spreadsheetId}`);
    console.log(`Found ${existingSheets.length} sheets.\n`);

    const mainSheetName = existingSheets[0]?.properties?.title;
    const requiredSheets = [
        { title: mainSheetName, minHeaders: 13, name: 'Main (Companies)' },
        { title: 'Logs_DoNotEdit', minHeaders: 5, name: 'Logs' },
        { title: 'Thread_History', minHeaders: 4, name: 'History' }
    ];

    for (const req of requiredSheets) {
        const sheet = existingSheets.find(s => s.properties.title === req.title);
        if (!sheet) {
            console.error(`❌ Missing sheet: ${req.title} (${req.name})`);
            continue;
        }

        try {
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `${req.title}!1:1`,
            });
            const headers = response.data.values?.[0] || [];

            if (headers.length >= req.minHeaders) {
                console.log(`✅ Sheet "${req.title}" (${req.name}) found with ${headers.length} headers.`);
            } else {
                console.warn(`⚠️ Sheet "${req.title}" (${req.name}) found but has only ${headers.length} headers (expected at least ${req.minHeaders}).`);
                console.log('   Current headers:', headers);
            }
        } catch (err) {
            console.error(`❌ Error reading headers for "${req.title}":`, err.message);
        }
    }
}

verifySetup().catch(console.error);
