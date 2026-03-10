/**
 * Migration Script: Populate Outreach Tracker from Main List
 * 
 * This script reads the existing main list (with multiple contacts per company)
 * and creates one row per company in the Outreach Tracker sheet.
 * 
 * Usage:
 *   cd outreach-tracker && npx ts-node ../scripts/migrate-to-outreach-tracker.ts
 */

const { google } = require('googleapis');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../outreach-tracker/.env.local') });

interface CompanyData {
    companyId: string;
    companyName: string;
    status: string;
    urgencyScore: number;
    previousResponse: string;
    assignedPic: string;
    lastContact: string;
    followUpsCompleted: number;
    sponsorshipTier: string;
    remarks: string;
    lastUpdate: string;
}

async function getGoogleSheetsClient() {
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;

    if (!privateKey || !serviceAccountEmail) {
        throw new Error('Missing Google Sheets credentials');
    }

    const auth = new google.auth.JWT(
        serviceAccountEmail,
        undefined,
        privateKey,
        ['https://www.googleapis.com/auth/spreadsheets']
    );

    return google.sheets({ version: 'v4', auth });
}

async function migrateData() {
    console.log('🚀 Starting migration...\n');

    const sheets = await getGoogleSheetsClient();
    const mainSpreadsheetId = process.env.SPREADSHEET_ID_1;
    const trackerSpreadsheetId = process.env.SPREADSHEET_ID_2;

    if (!mainSpreadsheetId || !trackerSpreadsheetId) {
        throw new Error('Missing spreadsheet IDs in .env.local');
    }

    // Step 1: Read from main list (SPREADSHEET_ID_1)
    console.log('📖 Reading data from main list...');
    const mainMetadata = await sheets.spreadsheets.get({ spreadsheetId: mainSpreadsheetId });

    // Find the [AUTOMATION ONLY] sheet or use first sheet
    let mainSheetName = mainMetadata.data.sheets?.find(sheet =>
        sheet.properties?.title?.includes('[AUTOMATION ONLY]')
    )?.properties?.title;

    if (!mainSheetName) {
        mainSheetName = mainMetadata.data.sheets?.[0].properties?.title;
    }

    if (!mainSheetName) {
        throw new Error('No sheet found in main spreadsheet');
    }

    console.log(`   Using sheet: ${mainSheetName}`);

    const mainResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: mainSpreadsheetId,
        range: `${mainSheetName}!A2:Z`, // Read all data
    });

    const rows = mainResponse.data.values || [];
    console.log(`   Found ${rows.length} rows\n`);

    // Step 2: Group by company and extract outreach data
    console.log('🔄 Processing companies...');
    const companyMap = new Map<string, CompanyData>();
    let companyCounter = 1;

    rows.forEach((row) => {
        const companyName = row[1]; // Column B: Company Name
        if (!companyName) return;

        // If this company hasn't been seen yet, create entry
        if (!companyMap.has(companyName)) {
            const companyId = `ME-${String(companyCounter).padStart(4, '0')}`;
            companyCounter++;

            companyMap.set(companyName, {
                companyId,
                companyName,
                status: row[4] || 'To Contact', // Column E: Status
                urgencyScore: 0, // Default, will be set by automation later
                previousResponse: row[4] || '', // Column E: Previous Response (from Database)
                assignedPic: row[13] || '', // Column N: PIC
                lastContact: row[14] || '', // Column O: Last Updated
                followUpsCompleted: parseInt(row[16]) || 0, // Column Q: Follow Ups Completed
                sponsorshipTier: '', // Will be set when status becomes "Interested"
                remarks: row[12] || '', // Column M: Remark
                lastUpdate: row[14] || new Date().toISOString(), // Column O: Last Updated
            });
        }
    });

    console.log(`   Processed ${companyMap.size} unique companies\n`);

    // Step 3: Prepare data for Outreach Tracker
    console.log('📝 Preparing Outreach Tracker data...');
    const trackerData: any[][] = [];

    // Add header row
    trackerData.push([
        'Company ID',
        'Company Name',
        'Status',
        'Urgency Score',
        'Previous Response',
        'Assigned PIC',
        'Last Contact',
        'Follow-up Count',
        'Sponsorship Tier',
        'Remarks',
        'Last Update'
    ]);

    // Add data rows
    companyMap.forEach((company) => {
        trackerData.push([
            company.companyId,
            company.companyName,
            company.status,
            company.urgencyScore,
            company.previousResponse,
            company.assignedPic,
            company.lastContact,
            company.followUpsCompleted,
            company.sponsorshipTier,
            company.remarks,
            company.lastUpdate
        ]);
    });

    // Step 4: Write to Outreach Tracker
    console.log('✍️  Writing to Outreach Tracker...');
    const trackerMetadata = await sheets.spreadsheets.get({ spreadsheetId: trackerSpreadsheetId });
    const trackerSheetName = trackerMetadata.data.sheets?.[0].properties?.title;

    if (!trackerSheetName) {
        throw new Error('No sheet found in Outreach Tracker spreadsheet');
    }

    console.log(`   Target sheet: ${trackerSheetName}`);

    // Clear existing data (if any)
    await sheets.spreadsheets.values.clear({
        spreadsheetId: trackerSpreadsheetId,
        range: `${trackerSheetName}!A:K`,
    });

    // Write new data
    await sheets.spreadsheets.values.update({
        spreadsheetId: trackerSpreadsheetId,
        range: `${trackerSheetName}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
            values: trackerData
        }
    });

    console.log(`   ✅ Successfully wrote ${trackerData.length - 1} companies\n`);

    // Step 5: Print summary
    console.log('📊 Migration Summary:');
    console.log(`   Total companies: ${companyMap.size}`);
    console.log(`   ID range: ME-0001 to ME-${String(companyCounter - 1).padStart(4, '0')}`);
    console.log('\n✨ Migration complete!');
    console.log('\n📋 Next steps:');
    console.log('   1. Review the Outreach Tracker sheet');
    console.log('   2. Set up conditional formatting for Is_Active column in Company Database');
    console.log('   3. Test the /api/data endpoint');
}

// Run migration
migrateData().catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
});
