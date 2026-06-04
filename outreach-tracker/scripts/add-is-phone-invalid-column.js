/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const { google } = require('googleapis');

const COMPILED_COMPANY_LIST = '[AUTOMATION ONLY] Compiled Company List';
const PREFERRED_COMPANY_DB_NAMES = [
    '[AUTOMATION ONLY] Outreach Tracker',
    '[AUTOMATION ONLY] Company Database',
    '[AUTOMATION ONLY] Compiled Company List',
    '[AUTOMATION ONLY]',
];

function getCompanyDatabaseSheet(sheets) {
    if (!sheets || sheets.length === 0) throw new Error('No sheets found');
    for (const preferred of PREFERRED_COMPANY_DB_NAMES) {
        const match = sheets.find(s => (s.properties?.title ?? '') === preferred);
        if (match) return { title: match.properties.title, sheetId: match.properties.sheetId };
    }
    const candidates = sheets.filter(s => {
        const t = s.properties?.title ?? '';
        return t !== COMPILED_COMPANY_LIST && t.includes('[AUTOMATION ONLY]');
    });
    if (candidates.length !== 1) {
        throw new Error(`Could not uniquely resolve company DB sheet (found ${candidates.length})`);
    }
    return { title: candidates[0].properties.title, sheetId: candidates[0].properties.sheetId };
}

async function main() {
    const spreadsheetId = process.env.SPREADSHEET_ID_1;
    if (!spreadsheetId) throw new Error('SPREADSHEET_ID_1 not set in .env.local');

    const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: privateKey,
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const { title: sheetName } = getCompanyDatabaseSheet(meta.data.sheets);
    console.log(`Target sheet: "${sheetName}"`);

    const headerRow = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A1:R1`,
    });
    const headers = headerRow.data.values?.[0] || [];
    const qHeader = headers[16] || '';
    const rHeader = headers[17] || '';
    console.log(`Current Q1: "${qHeader}"`);
    console.log(`Current R1: "${rHeader}"`);

    if (rHeader && rHeader.trim()) {
        console.log(`R1 is already set to "${rHeader}" — leaving untouched.`);
        return;
    }

    // Mirror the casing style of Q1 if we can detect it; otherwise default to isPhoneInvalid.
    let newHeader = 'isPhoneInvalid';
    const trimmedQ = qHeader.trim();
    if (trimmedQ) {
        // Try to mirror by replacing "email" (case-insensitively) with "phone"
        if (/email/i.test(trimmedQ)) {
            newHeader = trimmedQ.replace(/email/gi, (m) => (m[0] === m[0].toUpperCase() ? 'Phone' : 'phone'));
        }
    }

    console.log(`Writing R1 = "${newHeader}"`);
    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!R1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[newHeader]] },
    });
    console.log('Done.');
}

main().catch(err => {
    console.error('FAILED:', err.message);
    process.exit(1);
});
