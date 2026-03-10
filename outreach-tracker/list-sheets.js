const { google } = require('googleapis');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  
  console.log("Tracker Spreadsheet:");
  const res2 = await sheets.spreadsheets.get({ spreadsheetId: process.env.SPREADSHEET_ID_2 });
  res2.data.sheets.forEach(s => console.log(' - ' + s.properties.title));

  console.log("\nDatabase Spreadsheet:");
  const res1 = await sheets.spreadsheets.get({ spreadsheetId: process.env.SPREADSHEET_ID_1 });
  res1.data.sheets.forEach(s => console.log(' - ' + s.properties.title));
}

main().catch(console.error);
