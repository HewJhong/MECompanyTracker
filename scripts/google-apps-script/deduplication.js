/**
 * Google Apps Script for Outreach Tracker Deduplication
 * 
 * Instructions:
 * 1. Open your Google Sheet
 * 2. Go to Extensions > Apps Script
 * 3. Delete any existing code and paste this entire script
 * 4. Save the project (e.g., "Deduplication Tools")
 * 5. Select 'findDuplicates' from the toolbar and click Run
 * 6. View the Execution Log (View > Execution log) to see the results
 */

// CONFIGURATION
const CONFIG = {
    // Update these sheet names if they differ in your spreadsheet
    DB_SHEET_NAME: '[AUTOMATION ONLY] Company Database',
    TRACKER_SHEET_NAME: 'Outreach Tracker', // or whatever the first sheet is called
    HISTORY_SHEET_NAME: 'Thread_History',
    LOGS_SHEET_NAME: 'Logs_DoNotEdit',

    // Columns (A=1, B=2, etc.)
    DB_ID_COL: 1,      // A
    DB_NAME_COL: 2,    // B
    DB_EMAIL_COL: 8,   // H
    DB_REMARKS_COL: 13, // M
    DB_IS_ACTIVE_COL: 14, // N

    TRACKER_ID_COL: 1, // A
    TRACKER_NAME_COL: 2, // B
    TRACKER_STATUS_COL: 3, // C
    TRACKER_PIC_COL: 6, // F
    TRACKER_LAST_CONTACT_COL: 7, // G
    TRACKER_REMARKS_COL: 10, // J
    TRACKER_LAST_UPDATE_COL: 11, // K
};

const STATUS_ORDER = {
    'Completed': 7,
    'Interested': 6,
    'Negotiating': 5,
    'Contacted': 4,
    'To Contact': 3,
    'No Reply': 2,
    'Rejected': 1
};

/**
 * Merges tracker row data intelligently
 * @param {Array} keepRow - The row data to keep (from trackerSheet)
 * @param {Array} removeRow - The row data to merge in (from trackerSheet)
 * @param {string} keepId - The ID being kept
 * @param {string} removeId - The ID being removed
 * @returns {Array} Merged row data
 */
function mergeTrackerRows(keepRow, removeRow, keepId, removeId) {
    const merged = [...keepRow];

    // 1. Status: Use the "best" status
    const keepStatus = keepRow[CONFIG.TRACKER_STATUS_COL - 1] || 'To Contact';
    const removeStatus = removeRow[CONFIG.TRACKER_STATUS_COL - 1] || 'To Contact';
    const keepPriority = STATUS_ORDER[keepStatus] || 0;
    const removePriority = STATUS_ORDER[removeStatus] || 0;

    if (removePriority > keepPriority) {
        merged[CONFIG.TRACKER_STATUS_COL - 1] = removeStatus;
        console.log(`  Status: Using ${removeStatus} from ${removeId} (priority ${removePriority} > ${keepPriority})`);
    } else {
        console.log(`  Status: Keeping ${keepStatus} from ${keepId} (priority ${keepPriority} >= ${removePriority})`);
    }

    // 2. Remarks: Concatenate with source labels
    const keepRemarks = keepRow[CONFIG.TRACKER_REMARKS_COL - 1] || '';
    const removeRemarks = removeRow[CONFIG.TRACKER_REMARKS_COL - 1] || '';

    if (removeRemarks && removeRemarks.trim()) {
        const timestamp = new Date().toISOString().split('T')[0];
        if (keepRemarks && keepRemarks.trim()) {
            merged[CONFIG.TRACKER_REMARKS_COL - 1] =
                `[${keepId}]: ${keepRemarks}\n[Merged from ${removeId} on ${timestamp}]: ${removeRemarks}`;
        } else {
            merged[CONFIG.TRACKER_REMARKS_COL - 1] =
                `[Merged from ${removeId} on ${timestamp}]: ${removeRemarks}`;
        }
        console.log(`  Remarks: Merged from both IDs`);
    }

    // 3. PIC: If keepId has no PIC, take from removeId
    const keepPic = keepRow[CONFIG.TRACKER_PIC_COL - 1];
    const removePic = removeRow[CONFIG.TRACKER_PIC_COL - 1];

    if (!keepPic && removePic) {
        merged[CONFIG.TRACKER_PIC_COL - 1] = removePic;
        console.log(`  PIC: Inherited ${removePic} from ${removeId}`);
    }

    // 4. Timestamps: Keep the most recent
    const keepLastContact = keepRow[CONFIG.TRACKER_LAST_CONTACT_COL - 1];
    const removeLastContact = removeRow[CONFIG.TRACKER_LAST_CONTACT_COL - 1];

    if (removeLastContact && (!keepLastContact || new Date(removeLastContact) > new Date(keepLastContact))) {
        merged[CONFIG.TRACKER_LAST_CONTACT_COL - 1] = removeLastContact;
        console.log(`  Last Contact: Using ${removeLastContact} from ${removeId}`);
    }

    const keepLastUpdate = keepRow[CONFIG.TRACKER_LAST_UPDATE_COL - 1];
    const removeLastUpdate = removeRow[CONFIG.TRACKER_LAST_UPDATE_COL - 1];

    if (removeLastUpdate && (!keepLastUpdate || new Date(removeLastUpdate) > new Date(keepLastUpdate))) {
        merged[CONFIG.TRACKER_LAST_UPDATE_COL - 1] = removeLastUpdate;
        console.log(`  Last Update: Using ${removeLastUpdate} from ${removeId}`);
    }

    return merged;
}

/**
 * Deduplicates contacts for a given company ID in the Database sheet
 * Groups by email and keeps the best contact (active, most filled fields)
 * @param {Object} dbSheet - The database sheet object
 * @param {string} companyId - The company ID to deduplicate contacts for
 */
function deduplicateContacts(dbSheet, companyId) {
    console.log(`Deduplicating contacts for ${companyId}...`);

    const data = dbSheet.getDataRange().getValues();
    const contactsByEmail = new Map();
    const rowsToDelete = [];

    // Find all contacts for this company and group by email
    for (let i = 1; i < data.length; i++) {
        if (data[i][CONFIG.DB_ID_COL - 1] !== companyId) continue;

        const email = data[i][CONFIG.DB_EMAIL_COL - 1];
        if (!email || !email.trim()) continue; // Skip contacts without email

        if (!contactsByEmail.has(email)) {
            contactsByEmail.set(email, []);
        }

        contactsByEmail.get(email).push({
            rowIndex: i + 1, // 1-based row number
            rowData: data[i],
            isActive: data[i][CONFIG.DB_IS_ACTIVE_COL - 1] === 'TRUE',
            filledFieldCount: data[i].filter(cell => cell && cell.toString().trim()).length
        });
    }

    // For each email with duplicates, keep the best one
    contactsByEmail.forEach((contacts, email) => {
        if (contacts.length <= 1) return; // No duplicates

        console.log(`  Found ${contacts.length} contacts with email ${email}`);

        // Sort by: Active first, then by most filled fields
        contacts.sort((a, b) => {
            if (a.isActive !== b.isActive) return b.isActive ? 1 : -1;
            return b.filledFieldCount - a.filledFieldCount;
        });

        const keepContact = contacts[0];
        const mergeContacts = contacts.slice(1);

        // Merge remarks from duplicates
        const keepRemarks = keepContact.rowData[CONFIG.DB_REMARKS_COL - 1] || '';
        const mergedRemarks = mergeContacts
            .map(c => c.rowData[CONFIG.DB_REMARKS_COL - 1])
            .filter(r => r && r.trim() && r !== keepRemarks)
            .join(' | ');

        if (mergedRemarks) {
            const newRemarks = keepRemarks
                ? `${keepRemarks} | [Merged]: ${mergedRemarks}`
                : `[Merged]: ${mergedRemarks}`;
            dbSheet.getRange(keepContact.rowIndex, CONFIG.DB_REMARKS_COL).setValue(newRemarks);
            console.log(`    Merged remarks into row ${keepContact.rowIndex}`);
        }

        // Mark duplicate rows for deletion
        mergeContacts.forEach(c => {
            rowsToDelete.push(c.rowIndex);
            console.log(`    Marking row ${c.rowIndex} for deletion (duplicate)`);
        });
    });

    // Delete rows in reverse order to maintain row indices
    rowsToDelete.sort((a, b) => b - a);
    rowsToDelete.forEach(rowIndex => {
        dbSheet.deleteRow(rowIndex);
        console.log(`  Deleted duplicate contact row ${rowIndex}`);
    });

    if (rowsToDelete.length > 0) {
        console.log(`Deduplicated ${rowsToDelete.length} contact(s) for ${companyId}`);
    } else {
        console.log(`No duplicate contacts found for ${companyId}`);
    }
}


/**
 * Finds and logs companies that have:
 * 1. Same Name but Different IDs
 * 2. Same ID but Different Names (less likely)
 */
function findDuplicates() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Try to find the DB sheet
    let dbSheet = ss.getSheetByName(CONFIG.DB_SHEET_NAME);
    if (!dbSheet) {
        // Fallback: try to find a sheet with 'AUTOMATION ONLY'
        const sheets = ss.getSheets();
        dbSheet = sheets.find(s => s.getName().includes('AUTOMATION ONLY'));
        if (!dbSheet) {
            console.error(`Could not find sheet with name '${CONFIG.DB_SHEET_NAME}' or containing 'AUTOMATION ONLY'`);
            return;
        }
    }

    console.log(`Reading from Database Sheet: ${dbSheet.getName()}`);

    const data = dbSheet.getDataRange().getValues();
    // Remove header
    const rows = data.slice(1);

    const nameToIds = new Map();
    const idToNames = new Map();

    rows.forEach((row, index) => {
        const id = row[CONFIG.DB_ID_COL - 1];
        const name = row[CONFIG.DB_NAME_COL - 1];

        // Skip empty rows
        if (!id || !name || id.toString().includes('No.') || name === 'Company Name') return;

        // Track IDs per Name
        if (!nameToIds.has(name)) {
            nameToIds.set(name, new Set());
        }
        nameToIds.get(name).add(id);

        // Track Names per ID
        if (!idToNames.has(id)) {
            idToNames.set(id, new Set());
        }
        idToNames.get(id).add(name);
    });

    console.log('--- DUPLICATE COMPANIES (Same Name, Different IDs) ---');
    let foundDupes = false;
    nameToIds.forEach((ids, name) => {
        if (ids.size > 1) {
            foundDupes = true;
            console.log(`Company: "${name}" has IDs: [${Array.from(ids).join(', ')}]`);
        }
    });
    if (!foundDupes) console.log('No duplicates found.');

    console.log('--- ID CONFLICTS (Same ID, Different Names) ---');
    let foundConflicts = false;
    idToNames.forEach((names, id) => {
        if (names.size > 1) {
            foundConflicts = true;
            console.log(`ID: "${id}" has Names: [${Array.from(names).join(', ')}]`);
        }
    });
    if (!foundConflicts) console.log('No conflicts found.');
}

/**
 * Merges a duplicate ID into a target ID and shifts all subsequent IDs down.
 * 
 * WARNING: This checks specific IDs. Run this manually for each case found in `findDuplicates`.
 * Use with CAUTION.
 * 
 * Example Usage (in the Run function dropdown):
 * runMerge_StantaMauser()
 */
function runMerge_StantaMauser() {
    // Example: Merge ME-0557 (duplicate) INTO ME-0100 (original)
    // This means ME-0557 will be deleted, contacts moved to ME-0100, and ME-0558 -> ME-0557
    mergeAndShift('ME-0100', 'ME-0557');
}

function runMerge_Ansell() {
    mergeAndShift('ME-0212', 'ME-0664');
}

/**
 * Core function to perform the merge and shift
 * @param {string} keepId - The ID to keep (e.g., "ME-0100")
 * @param {string} removeId - The ID to remove/merge (e.g., "ME-0557")
 */
function mergeAndShift(keepId, removeId) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ui = SpreadsheetApp.getUi();

    const result = ui.alert(
        'Confirm Merge',
        `Are you SURE you want to merge ${removeId} INTO ${keepId}?\n\n` +
        `This will:\n1. Move all contacts from ${removeId} to ${keepId}\n` +
        `2. Delete ${removeId} from Outreach Tracker\n` +
        `3. Shift ALL IDs greater than ${removeId} down by 1 (closing the gap)\n`,
        ui.ButtonSet.YES_NO
    );

    if (result !== ui.Button.YES) {
        console.log('Operation cancelled by user.');
        return;
    }

    // 1. Setup Sheets
    let dbSheet = ss.getSheetByName(CONFIG.DB_SHEET_NAME) || ss.getSheets().find(s => s.getName().includes('AUTOMATION ONLY'));
    let trackerSheet = ss.getSheetByName(CONFIG.TRACKER_SHEET_NAME) || ss.getSheets()[0]; // Default to first sheet if not found
    let historySheet = ss.getSheetByName(CONFIG.HISTORY_SHEET_NAME);
    let logsSheet = ss.getSheetByName(CONFIG.LOGS_SHEET_NAME);

    // 2. Parse ID numbers to handle shifting
    const removeNum = parseInt(removeId.replace('ME-', ''));
    if (isNaN(removeNum)) {
        console.error(`Invalid ID format: ${removeId}`);
        return;
    }

    console.log(`Starting Merge: ${removeId} -> ${keepId}...`);

    // 3. Smart Merge Tracker Rows
    const trackerData = trackerSheet.getDataRange().getValues();
    let keepRowIndex = -1;
    let removeRowIndex = -1;
    let keepRowData = null;
    let removeRowData = null;

    for (let i = 1; i < trackerData.length; i++) {
        const rowId = trackerData[i][CONFIG.TRACKER_ID_COL - 1];
        if (rowId === keepId) {
            keepRowIndex = i + 1;
            keepRowData = trackerData[i];
        } else if (rowId === removeId) {
            removeRowIndex = i + 1;
            removeRowData = trackerData[i];
        }
    }

    if (keepRowIndex === -1) {
        console.error(`Could not find tracker row for ${keepId}`);
        return;
    }

    if (removeRowIndex === -1) {
        console.warn(`Could not find tracker row for ${removeId} to merge`);
    } else {
        console.log(`Merging tracker data from ${removeId} into ${keepId}...`);
        const mergedRow = mergeTrackerRows(keepRowData, removeRowData, keepId, removeId);

        // Write merged data back to keepId row
        for (let col = 0; col < mergedRow.length; col++) {
            trackerSheet.getRange(keepRowIndex, col + 1).setValue(mergedRow[col]);
        }
        console.log(`Tracker row ${keepId} updated with merged data`);
    }

    // 4. Update Database Sheet (Contacts)
    // Change all occurrences of removeId to keepId
    const dbData = dbSheet.getDataRange().getValues();

    for (let i = 1; i < dbData.length; i++) { // Skip header
        if (dbData[i][CONFIG.DB_ID_COL - 1] === removeId) {
            dbSheet.getRange(i + 1, CONFIG.DB_ID_COL).setValue(keepId);
            console.log(`DB Update: Row ${i + 1} changed ${removeId} to ${keepId}`);
        } else if (dbData[i][CONFIG.DB_ID_COL - 1]) {
            // Check if this ID needs shifting (if it's > removeId)
            const rowId = dbData[i][CONFIG.DB_ID_COL - 1];
            const rowNumStr = rowId.toString().replace('ME-', '');
            const rowNum = parseInt(rowNumStr);

            if (!isNaN(rowNum) && rowNum > removeNum) {
                const newId = `ME-${String(rowNum - 1).padStart(4, '0')}`;
                dbSheet.getRange(i + 1, CONFIG.DB_ID_COL).setValue(newId);
            }
        }
    }

    // 5. Deduplicate Contacts for the merged company
    deduplicateContacts(dbSheet, keepId);

    // 6. Delete removeId row from Tracker and shift IDs
    const trackerShifts = [];

    for (let i = 1; i < trackerData.length; i++) {
        const rowId = trackerData[i][CONFIG.TRACKER_ID_COL - 1];

        if (rowId === removeId) {
            // Skip - will delete after loop
        } else if (rowId) {
            const rowNum = parseInt(rowId.toString().replace('ME-', ''));
            if (!isNaN(rowNum) && rowNum > removeNum) {
                const newId = `ME-${String(rowNum - 1).padStart(4, '0')}`;
                trackerSheet.getRange(i + 1, CONFIG.TRACKER_ID_COL).setValue(newId);
            }
        }
    }

    if (removeRowIndex !== -1) {
        trackerSheet.deleteRow(removeRowIndex);
        console.log(`Tracker: Deleted row ${removeRowIndex} for ${removeId}`);
    } else {
        console.warn(`Tracker: Could not find row for ${removeId} to delete.`);
    }

    // 7. Update History & Logs (Optional but recommended)
    // Similar logic: find removeId -> keepId, find > removeId -> shift
    if (historySheet) updateAuxiliarySheet(historySheet, 1, keepId, removeId, removeNum); // Col 2 is ID (Index 1)
    if (logsSheet) updateAuxiliarySheet(logsSheet, 2, keepId, removeId, removeNum);    // Col 3 is ID (Index 2)

    console.log('Merge and Shift Complete.');
    ui.alert('Success', `Merged ${removeId} into ${keepId} and shifted subsequent IDs.`, ui.ButtonSet.OK);
}

function updateAuxiliarySheet(sheet, idColIndex, keepId, removeId, removeNum) {
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
        const rowId = data[i][idColIndex];
        if (!rowId) continue;

        if (rowId === removeId) {
            sheet.getRange(i + 1, idColIndex + 1).setValue(keepId);
        } else {
            const rowNum = parseInt(rowId.toString().replace('ME-', ''));
            if (!isNaN(rowNum) && rowNum > removeNum) {
                const newId = `ME-${String(rowNum - 1).padStart(4, '0')}`;
                sheet.getRange(i + 1, idColIndex + 1).setValue(newId);
            }
        }
    }
}
