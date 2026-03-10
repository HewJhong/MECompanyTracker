/**
 * Google Apps Script for Auditing Data Alignment
 * 
 * Instructions:
 * 1. Open your Google Sheet
 * 2. Go to Extensions > Apps Script
 * 3. Create a new file (File > New > Script file) named 'AuditData.gs'
 * 4. Paste this code
 * 5. Run 'auditContactAlignment' function
 * 6. Check Execution Log for results
 */

// CONFIGURATION
const AUDIT_CONFIG = {
    // Update these sheet names if they differ in your spreadsheet
    DB_SHEET_NAME: '[AUTOMATION ONLY] Company Database',
    TRACKER_SHEET_NAME: 'Outreach Tracker', // or whatever the first sheet is called if known

    // Columns (A=1, B=2, etc.)
    DB_ID_COL: 1,      // A
    DB_NAME_COL: 2,    // B     
    DB_PIC_COL: 6,     // F (Contact Person)
    DB_EMAIL_COL: 8,   // H

    TRACKER_ID_COL: 1, // A
    TRACKER_NAME_COL: 2, // B
};

function auditContactAlignment() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Get sheets
    let dbSheet = ss.getSheetByName(AUDIT_CONFIG.DB_SHEET_NAME);
    if (!dbSheet) {
        // Fallback: search for sheet with label
        dbSheet = ss.getSheets().find(s => s.getName().includes('[AUTOMATION ONLY]'));
    }

    // Get Tracker sheet (assuming first sheet if name not exact match)
    let trackerSheet = ss.getSheetByName(AUDIT_CONFIG.TRACKER_SHEET_NAME);
    if (!trackerSheet) {
        trackerSheet = ss.getSheets()[0];
    }

    if (!dbSheet || !trackerSheet) {
        console.error("Could not find required sheets.");
        return;
    }

    console.log(`Auditing Database: ${dbSheet.getName()}`);
    console.log(`Against Tracker: ${trackerSheet.getName()}`);

    // Read data
    const dbData = dbSheet.getDataRange().getValues();
    const trackerData = trackerSheet.getDataRange().getValues();

    // Map Tracker IDs to Names
    const trackerMap = new Map();
    // Skip header
    for (let i = 1; i < trackerData.length; i++) {
        const id = trackerData[i][AUDIT_CONFIG.TRACKER_ID_COL - 1];
        const name = trackerData[i][AUDIT_CONFIG.TRACKER_NAME_COL - 1];
        if (id) trackerMap.set(id.toString().trim(), { name, rowIndex: i + 1 });
    }

    console.log(`Loaded ${trackerMap.size} companies from Tracker.`);
    console.log("--- START AUDIT ---");

    let misalignmentCount = 0;

    // Check Database rows
    // Skip header
    for (let i = 1; i < dbData.length; i++) {
        const id = dbData[i][AUDIT_CONFIG.DB_ID_COL - 1]?.toString().trim();
        const dbName = dbData[i][AUDIT_CONFIG.DB_NAME_COL - 1];
        const contactName = dbData[i][AUDIT_CONFIG.DB_PIC_COL - 1];

        if (!id) continue;

        // 1. Check if ID exists in Tracker
        if (!trackerMap.has(id)) {
            console.warn(`[Row ${i + 1}] ORPHAN ID: ${id} (DB Name: "${dbName}") - Not found in Tracker`);
            continue;
        }

        const trackerInfo = trackerMap.get(id);

        // 2. Check Name Mismatch
        // Simple normalization for comparison
        const normDbName = String(dbName).toLowerCase().trim();
        const normTrackerName = String(trackerInfo.name).toLowerCase().trim();

        if (normDbName !== normTrackerName &&
            !normDbName.includes(normTrackerName) &&
            !normTrackerName.includes(normDbName)) {

            console.error(`[Row ${i + 1}] NAME MISMATCH for ${id}:`);
            console.error(`   DB says: "${dbName}"`);
            console.error(`   Tracker says: "${trackerInfo.name}"`);
            misalignmentCount++;
        }

        // 3. Log Contact Person for spot check
        // Log every 50th row or if specifically requested
        if (i % 50 === 0) {
            console.log(`[Row ${i + 1}] Spot Check ${id}: Contact="${contactName}"`);
        }
    }

    console.log("--- END AUDIT ---");
    console.log(`Found ${misalignmentCount} potentially misaligned companies based on name.`);
}
