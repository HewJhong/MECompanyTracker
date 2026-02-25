/**
 * Migration Script: Populate Outreach Tracker from Main List
 * 
 * This script reads the existing main list (with multiple contacts per company)
 * and creates one row per company in the Outreach Tracker sheet.
 * 
 * Usage:
 *   nvm use 20 && node migrate-to-outreach-tracker.js
 */

const { google } = require('googleapis');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env.local') });

async function getGoogleSheetsClient() {
    const scopes = ['https://www.googleapis.com/auth/spreadsheets'];

    // Support newlines in private key if they are escaped in the environment variable
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

    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    return sheets;
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
    let mainSheetName = mainMetadata.data.sheets?.find((sheet) =>
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

    // Step 2: Group by Company ID and extract outreach data
    console.log('🔄 Processing companies...');
    const companyMap = new Map();
    const companyNameSet = new Set();
    let nextAutoId = 1; // For companies without IDs

    // First pass: find the highest existing ID to avoid conflicts
    rows.forEach((row) => {
        const companyId = row[0];
        if (companyId && companyId !== 'undefined' && companyId !== 'No.' && !isNaN(companyId)) {
            const numId = parseInt(companyId);
            if (numId >= nextAutoId) {
                nextAutoId = numId + 1;
            }
        }
    });

    console.log(`   Auto-ID will start from: ${nextAutoId}`);

    rows.forEach((row) => {
        let companyId = row[0]; // Column A: Company ID
        const companyName = row[1]; // Column B: Company Name

        // Skip completely empty rows
        if (!companyName || companyName === 'undefined') return;

        // Skip header rows
        if (companyId === 'No.' || companyName === 'Company Name') return;

        // Skip legend rows by name patterns
        if (companyId?.toString().toLowerCase().includes('legend')) return;
        if (companyName.toString().toLowerCase().includes('legend')) return;

        // Skip legend entries (common patterns found at the end of lists)
        const legendPatterns = [
            'contacted for',
            'contact from',
            'previous reachable',
            'unreachable',
            'whatsapp',
            'linkedin',
            'cold call',
            'email',
            'phone'
        ];

        const nameLower = companyName.toString().toLowerCase();
        if (legendPatterns.some(pattern => nameLower.includes(pattern) && nameLower.length < 50)) {
            // Only skip if the name is short and contains legend patterns
            // This avoids skipping real companies like "LinkedIn Corporation"
            if (nameLower === 'whatsapp/linkedin' ||
                nameLower === 'cold call' ||
                nameLower.startsWith('contacted for') ||
                nameLower.startsWith('contact from') ||
                nameLower.startsWith('previous reachable') ||
                nameLower.startsWith('unreachable')) {
                return;
            }
        }

        // Auto-generate ID if missing
        if (!companyId || companyId === 'undefined') {
            companyId = String(nextAutoId);
            nextAutoId++;
            console.log(`   Auto-generated ID ${companyId} for: ${companyName}`);
        }

        // Track unique company names
        companyNameSet.add(companyName);

        // If this Company ID hasn't been seen yet, create entry
        if (!companyMap.has(companyId)) {
            companyMap.set(companyId, {
                companyId,
                companyName,
                status: row[15] || 'To Contact', // Column P: Status
                urgencyScore: 0, // Default, will be set by automation later
                previousResponse: row[4] || '', // Column E: Previous Response
                assignedPic: row[13] || '', // Column N: PIC
                lastContact: row[14] || '', // Column O: Last Updated
                followUpsCompleted: parseInt(row[16]) || 0, // Column Q: Follow Ups Completed
                sponsorshipTier: '', // Will be set when status becomes "Interested"
                remarks: row[12] || '', // Column M: Remark
                lastUpdate: row[14] || new Date().toISOString(), // Column O: Last Updated
            });
        }
    });

    console.log(`   Processed ${companyMap.size} unique companies (by Company ID)`);
    console.log(`   Found ${companyNameSet.size} unique company names`);
    if (companyMap.size !== companyNameSet.size) {
        console.log(`   ⚠️  Warning: Company ID count (${companyMap.size}) differs from Company Name count (${companyNameSet.size})`);
    }
    console.log('');

    // Step 3: Prepare data for Outreach Tracker
    console.log('📝 Preparing Outreach Tracker data...');
    const trackerData = [];

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

    // Get first and last company ID
    const companyIds = Array.from(companyMap.keys()).sort();
    console.log(`   Company ID range: ${companyIds[0]} to ${companyIds[companyIds.length - 1]}`);

    console.log('\n✨ Migration complete!');
    console.log('\n📋 Next steps:');
    console.log('   1. Review the Outreach Tracker sheet');
    console.log('   2. Manually add Company IDs to the Company Database sheet');
    console.log('   3. Set up conditional formatting for Is_Active column');
    console.log('   4. Test the /api/data endpoint');
}

// Run migration
migrateData().catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
});
