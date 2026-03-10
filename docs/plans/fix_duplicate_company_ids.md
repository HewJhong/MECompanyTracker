# Plan: Fix Duplicate Company IDs and Shift Sequential IDs

## Problem
Multiple companies have been entered twice with different Company IDs. The user wants to merge these duplicates and shift all subsequent IDs to maintain a sequential, gap-less ID system (e.g., ME-0001, ME-0002, ...).

## Analysis
Based on a scan of the database, the following companies have duplicate entries with different IDs:
1. **Stanta Mauser**: `ME-0100` and `ME-0557`
2. **Ansell**: `ME-0212` and `ME-0664`
3. **PLUS Malaysia Berhad**: `ME-0308` and `ME-0593`
4. **Lattice Semiconductor**: `ME-0400` and `ME-0642`

Merging these requires:
1. Consolidating all data (contacts, history, logs) under a single "Good ID".
2. Deleting the redundant row in the Outreach Tracker.
3. Updating all subsequent IDs in all sheets to fill the gap (e.g., if `ME-0557` is deleted, `ME-0558` becomes `ME-0557`).

## Proposed Solution: Google Apps Script
Since the user mentioned Apps Script, I will provide a script that can be run directly in the Google Sheets Script Editor. This is safer as it allows the user to see exactly what is being modified.

### Implementation Tasks

#### Phase 1: Script Development
- [ ] Create a comprehensive Apps Script function `mergeAndShiftCompany(goodId, badId)` that:
    - Updates all occurrences of `badId` to `goodId` in:
        - `Company Database` ([AUTOMATION ONLY])
        - `Outreach Tracker`
        - `Thread_History`
        - `Logs_DoNotEdit`
    - Merges the `Outreach Tracker` row for `badId` into `goodId` (if both exist).
    - Deletes the `badId` row from `Outreach Tracker`.
    - Finds all IDs higher than `badId` and decrements them (e.g., `ME-0101` -> `ME-0100`).
    - Updates all references to these shifted IDs in all sheets.

#### Phase 2: User Verification
- [ ] Confirm with the user which company they want to fix first.
- [ ] Warn the user about the risks of shifting IDs (e.g., bookmarks to specific IDs will break).

#### Phase 3: Execution
- [ ] Provide the script and instructions for the user to run it.
- [ ] Alternatively, if the user prefers, I can execute a Node.js version of this script.

## Success Criteria
- No more duplicate IDs for the target company.
- All contact information, history, and logs are preserved under the merged ID.
- The ID sequence is continuous (no gaps) after the "bad" ID.
- All subsequent companies have their IDs updated correctly across all sheets.
