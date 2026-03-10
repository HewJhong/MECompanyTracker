import { google } from 'googleapis';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function getClient() {
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
    const client = await auth.getClient() as any;
    return google.sheets({ version: 'v4', auth: client });
}

function hasHighlight(color?: { red?: number | null, green?: number | null, blue?: number | null } | null) {
    if (!color) return false;
    // We assume white is completely un-highlighted {red:1, green:1, blue:1}
    const isUncolored = (color.red === 1 || color.red === undefined) &&
        (color.green === 1 || color.green === undefined) &&
        (color.blue === 1 || color.blue === undefined);
    return !isUncolored;
}

async function run() {
    const sheets = await getClient();
    const spreadsheetId = process.env.SPREADSHEET_ID_1;
    if (!spreadsheetId) {
        throw new Error('SPREADSHEET_ID_1 missing');
    }

    const metadata = await sheets.spreadsheets.get({ spreadsheetId });
    const dbSheet = metadata.data.sheets?.find(s => s.properties?.title?.includes('[AUTOMATION ONLY]'));
    const sheetName = dbSheet?.properties?.title;

    if (!sheetName) throw new Error('DB Sheet not found');

    const res = await sheets.spreadsheets.get({
        spreadsheetId,
        ranges: [`${sheetName}!F2:O`],
        includeGridData: true,
        // specifically ask for formatting and values
        fields: 'sheets(data(rowData(values(effectiveFormat/backgroundColor,effectiveValue,userEnteredValue))))'
    });

    const rows = res.data.sheets?.[0].data?.[0].rowData || [];

    console.log(`Scanning up to ${rows.length} rows for highlights...`);
    const updates: any[] = [];
    let migratedCount = 0;

    // F (idx 0), G (1), H email (2), I phone (3), J(4), K(5), L(6), M(7), N isActive (8), O activeMethods (9)
    rows.forEach((row, index) => {
        const rowNumber = index + 2;
        const vals = row.values || [];

        // Skip completely empty rows
        if (!vals[0]?.effectiveValue && (!vals[2]?.effectiveValue && !vals[3]?.effectiveValue)) {
            return;
        }

        const nameColor = vals[0]?.effectiveFormat?.backgroundColor;
        const emailColor = vals[2]?.effectiveFormat?.backgroundColor;
        const phoneColor = vals[3]?.effectiveFormat?.backgroundColor;

        const methods: string[] = [];
        let anyHighlighted = false;

        if (hasHighlight(phoneColor)) {
            methods.push('phone');
            anyHighlighted = true;
        }
        if (hasHighlight(emailColor)) {
            methods.push('email');
            anyHighlighted = true;
        }
        if (hasHighlight(nameColor) && methods.length === 0) {
            // User highlighted just the name without specific contact method
            // E.g. assume both or just keep as active with no specific method
            anyHighlighted = true;
        }

        const isActiveCurrent = vals[8]?.effectiveValue?.boolValue ||
            vals[8]?.effectiveValue?.stringValue?.toUpperCase() === 'TRUE';

        const existingMethods = vals[9]?.effectiveValue?.stringValue || '';

        // If the row is currently highlighted OR it was active OR we made changes
        const shouldBeActive = anyHighlighted || isActiveCurrent;
        let methodStr = methods.join(',');

        if (anyHighlighted) {
            // Push active methods to column O
            updates.push({
                range: `${sheetName}!O${rowNumber}`,
                values: [[methodStr]]
            });
            // Also ensure N is TRUE
            updates.push({
                range: `${sheetName}!N${rowNumber}`,
                values: [[shouldBeActive ? 'TRUE' : 'FALSE']]
            });
            migratedCount++;
        }
    });

    if (updates.length > 0) {
        console.log(`Writing ${updates.length} cell updates for ${migratedCount} contacts...`);
        // We'll write this in chunks of 500 batches to be safe, or just one batch
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: {
                valueInputOption: 'USER_ENTERED',
                data: updates
            }
        });
        console.log('Migration complete. You can now use Conditional Formatting to read from Column O.');
    } else {
        console.log('No highlights found. Nothing to update.');
    }
}

run().catch(console.error);
