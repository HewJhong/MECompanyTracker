# Google Sheet Cleaning & Setup Script Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a comprehensive Google Apps Script to prepare the existing Google Sheet for the Outreach Tracker App. This includes unmerging cells, filling values down, adding necessary system columns, and creating required system sheets.

**Architecture:** Google Apps Script.
**Tech Stack:** JavaScript (Google Apps Script).
**Reference:** `docs/plans/outreach-tracker-design.md`

---

## Task 1: Create Comprehensive Setup Script

**Files:**
- Create/Overwrite: `scripts/google_apps_script/Code.js`

**Step 1: Write the Script**

```javascript
/**
 * MENU
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Outreach Tracker Tools')
    .addItem('1. Unmerge & Fill All', 'unmergeAndFill')
    .addItem('2. Setup Columns & Sheets', 'setupEnvironment')
    .addSeparator()
    .addItem('Debug: Show System Sheets', 'unhideSystemSheets')
    .addToUi();
}

/**
 * 1. UNMERGE UTILITY
 */
function unmergeAndFill() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const ui = SpreadsheetApp.getUi();
  
  const result = ui.alert(
     'Please Confirm',
     'This will unmerge ALL cells in the active sheet. Are you sure?',
      ui.ButtonSet.YES_NO
  );

  if (result !== ui.Button.YES) return;

  const range = sheet.getDataRange();
  const mergedRanges = range.getMergedRanges();

  if (mergedRanges.length === 0) {
    ui.alert("No merged cells found!");
    return;
  }
  
  mergedRanges.forEach(mergedRange => {
    const value = mergedRange.getCell(1, 1).getValue();
    mergedRange.breakApart();
    mergedRange.setValue(value);
  });
  
  ui.alert(`Successfully unmerged ${mergedRanges.length} ranges.`);
}

/**
 * 2. SETUP ENVIRONMENT
 */
function setupEnvironment() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mainSheet = ss.getActiveSheet();
  const ui = SpreadsheetApp.getUi();

  // --- A. Add Columns ---
  const LAST_UPDATED_COL_HEADER = "Last Updated";
  const IS_FLAGGED_COL_HEADER = "Is Flagged";
  
  const headers = mainSheet.getRange(1, 1, 1, mainSheet.getLastColumn()).getValues()[0];
  
  let hasLastUpdated = headers.includes(LAST_UPDATED_COL_HEADER);
  let hasIsFlagged = headers.includes(IS_FLAGGED_COL_HEADER);
  
  if (!hasLastUpdated) {
    mainSheet.getRange(1, headers.length + 1).setValue(LAST_UPDATED_COL_HEADER);
  }
  
  const currentLastCol = mainSheet.getLastColumn();
  
  if (!hasIsFlagged) {
    mainSheet.getRange(1, currentLastCol + 1).setValue(IS_FLAGGED_COL_HEADER);
    const lastColIndex = mainSheet.getLastColumn();
    const numRows = mainSheet.getMaxRows();
    if (numRows > 1) {
        const checkboxRange = mainSheet.getRange(2, lastColIndex, numRows - 1, 1);
        checkboxRange.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
    }
  }

  // --- B. Create System Sheets ---
  const systemSheets = ['Logs_DoNotEdit', 'Thread_History', 'Committee_Status'];
  let createdCount = 0;
  
  systemSheets.forEach(sheetName => {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      // sheet.hideSheet(); // DISABLED AUTOMATIC HIDING FOR DEBUGGING
      
      if (sheetName === 'Logs_DoNotEdit') sheet.appendRow(['Timestamp', 'User', 'Company ID/Name', 'Field', 'Old Value', 'New Value', 'Remark']);
      else if (sheetName === 'Committee_Status') sheet.appendRow(['Committee Member', 'Last Active Timestamp']);
      else if (sheetName === 'Thread_History') sheet.appendRow(['Timestamp', 'Company Name', 'User', 'Remark Content']);
      
      createdCount++;
    }
  });

  ui.alert(`Setup Complete! Added columns if missing. Created ${createdCount} new system sheets (visible now for verification).`);
}

/**
 * DEBUG: SHOW SHEETS
 */
function unhideSystemSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const systemSheets = ['Logs_DoNotEdit', 'Thread_History', 'Committee_Status'];
  let msg = "Sheet Status:\n";
  
  systemSheets.forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (sheet) {
      const wasHidden = sheet.isSheetHidden();
      sheet.showSheet();
      msg += `- ${name}: Found (Was Hidden: ${wasHidden})\n`;
    } else {
      msg += `- ${name}: NOT FOUND\n`;
    }
  });
  
  SpreadsheetApp.getUi().alert(msg);
}
```

**Step 2: Save File**
Save the code to `scripts/google_apps_script/Code.js`.

---
