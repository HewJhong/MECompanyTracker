
const { getGoogleSheetsClient } = require('./lib/google-sheets');
require('dotenv').config();

async function check() {
    try {
        const sheets = await getGoogleSheetsClient();
        const trackerId = process.env.SPREADSHEET_ID_2;
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: trackerId,
            range: 'A:B'
        });
        const rows = res.data.values || [];
        const nameMap = new Map();
        const duplicates = [];

        rows.forEach((row, i) => {
            if (i === 0) return; // header
            const id = row[0];
            const name = row[1];
            if (!name) return;
            const norm = name.toLowerCase().trim();
            if (nameMap.has(norm)) {
                duplicates.push({ name, firstId: nameMap.get(norm).id, secondId: id, rows: [nameMap.get(norm).row, i + 1] });
            } else {
                nameMap.set(norm, { id, row: i + 1 });
            }
        });

        console.log(JSON.stringify(duplicates, null, 2));
    } catch (e) {
        console.error(e);
    }
}
check();
