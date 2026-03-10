# Implementation Plan: Google Apps Script for Deduplication

## Goal
Create a Google Apps Script that can identify companies with duplicate entries (different IDs) and provide a mechanism to merge them and shift subsequent IDs to maintain a continuous sequence.

## Script Features

### 1. `findDuplicates()`
- **Goal**: Scan the "Database" sheet (source of truth for contacts).
- **Logic**:
    - Get all values from Columns A (ID) and B (Name).
    - Create a map of `CompanyName -> [List of IDs]`.
    - Log any CompanyName that has > 1 unique ID associated with it.
    - Also check for `ID -> [List of CompanyNames]` to find ID collisions (unlikely but good to check).

### 2. `mergeAndShift(goodId, badId)`
- **Goal**: Merge `badId` into `goodId` intelligently, remove `badId`, then shift all IDs > `badId`.
- **Logic**:
    - **Step 1: Smart Merge in Tracker Sheet**
        - Get rows for both `goodId` and `badId`.
        - **Status**: Use the "best" status (Completed > Interested > Negotiating > Contacted > To Contact > No Reply).
        - **Remarks**: Concatenate remarks with timestamps/IDs (e.g., `[Original]: ... \n [Merged]: ...`).
        - **PIC**: If `goodId` has no PIC, take from `badId`.
        - **Timestamps**: Keep the valid/most recent timestamps for `Last Contact`, `Last Update`, etc.
        - update `goodId` row with merged data.
        - Delete `badId` row.

    - **Step 2: Merge & Deduplicate Contacts (Database Sheet)**
        - Find all rows for `badId`. Change them to `goodId`.
        - **Deduplication**:
            - Group all contacts for `goodId` (including newly moved ones) by `Email`.
            - If email duplicates found:
                - Keep the one with `Is_Active = TRUE` or most filled fields.
                - Merge remarks if different.
                - Delete the redundant contact rows.

    - **Step 3: Shift IDs**
        - Identify `badId` purely numeric part (e.g. 557).
        - Find all IDs > 557.
        - Decrement them by 1 (e.g. ME-0558 -> ME-0557).
        - Update:
            - Database Sheet (Col A)
            - Tracker Sheet (Col A)
            - Thread History (Col B - Company ID)
            - Logs (Col C - Company ID)

## Usage Instructions
1. Open Google Sheet.
2. Extensions > Apps Script.
3. Paste code.
4. Run `findDuplicates` to see the report.
5. (Carefully) Run `mergeAndShift('ME-0100', 'ME-0557')` for each pair found.

## Files
- `scripts/google-apps-script/deduplication.js`: The source code for the user to copy.
