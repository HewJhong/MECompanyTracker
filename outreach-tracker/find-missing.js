const { google } = require('googleapis');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env.local') });

async function findMissingCompanies() {
    console.log('🔍 Finding companies without discipline...\n');

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
        range: `${mainSheetName}!A2:E`, // ID, Name, Discipline, Target Tier, Status/PrevResponse
    });

    const rows = response.data.values || [];

    let withDisciplineCount = 0;
    let withoutDisciplineCount = 0;
    const companiesWithoutDiscipline = [];
    const uniqueCompanyIds = new Set();

    rows.forEach((row, index) => {
        const companyId = row[0];
        const companyName = row[1];
        const discipline = row[2];

        // Skip header and legend rows
        if (!companyId || !companyName) return;
        if (companyId === 'No.' || companyName === 'Company Name') return;
        if (companyId.toString().toLowerCase().includes('legend')) return;
        if (companyName.toString().toLowerCase().includes('legend')) return;
        if (companyId === 'undefined' || companyName === 'undefined') return;

        uniqueCompanyIds.add(companyId);

        if (!discipline || discipline === '' || discipline === 'undefined') {
            withoutDisciplineCount++;
            if (companiesWithoutDiscipline.length < 25) {
                companiesWithoutDiscipline.push({
                    row: index + 2,
                    id: companyId,
                    name: companyName,
                    discipline: discipline || '(empty)'
                });
            }
        } else {
            withDisciplineCount++;
        }
    });

    console.log(`📊 Analysis:`);
    console.log(`   Unique Company IDs: ${uniqueCompanyIds.size}`);
    console.log(`   Companies WITH discipline: ${withDisciplineCount}`);
    console.log(`   Companies WITHOUT discipline: ${withoutDisciplineCount}`);
    console.log(`   Total: ${withDisciplineCount + withoutDisciplineCount}`);

    if (companiesWithoutDiscipline.length > 0) {
        console.log(`\n📋 First ${Math.min(25, companiesWithoutDiscipline.length)} companies without discipline:`);
        companiesWithoutDiscipline.forEach(c => {
            console.log(`   Row ${c.row}: ID=${c.id}, Name="${c.name}", Discipline=${c.discipline}`);
        });
    }
}

findMissingCompanies().catch(console.error);
