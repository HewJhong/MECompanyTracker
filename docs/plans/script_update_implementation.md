# Implementation Plan - Update Deduplication Script

Update `scripts/google-apps-script/deduplication.js` to implement the "Smart Merge" logic and "Contact Deduplication" as outlined in `docs/plans/deduplication_script.md`.

## User Review Required

> [!IMPORTANT]
> This plan implements data merging logic. Please verify the Status Priority and Remarks format.

- [ ] **Status Priority**: Completed > Interested > Negotiating > Contacted > To Contact > No Reply.
- [ ] **Remarks Merge**: Concatenate with source ID labels.

---

## Proposed Changes

### Phase 1: Enhanced Tracker Row Merging ✅
- [x] Define `STATUS_ORDER` object for status priority comparison.
- [x] Add `mergeTrackerRows(keepRow, removeRow)` helper to:
    - Compare and pick the best status.
    - Concatenate Remarks: `[Keep]: ... \n[Merged from {removeId}]: ...`.
    - Inherit PIC if `keepId` row is missing it.
    - Take the latest `Last Contact` and `Last Update` timestamps.
- [x] Update `mergeAndShift` to use this logic before deleting the `removeId` row.

### Phase 2: Contact Deduplication (Database Sheet) ✅
- [x] After updating IDs in the Database sheet, implement `deduplicateContacts(keepId)`.
- [x] Logic for `deduplicateContacts`:
    - Filter rows for the `keepId`.
    - Group by `Email`.
    - If duplicates exist:
        - Prioritize row where `Is_Active` is `TRUE`.
        - Merge `Remarks`.
        - Keep the row with the most non-empty fields.
        - Mark redundant rows for deletion.
- [x] Perform batch deletion of redundant contact rows.

### Phase 3: Robust ID Shifting ✅
- [x] Ensure `updateAuxiliarySheet` correctly handles both ID replacement and ID shifting.
- [x] Verify column indices for `Thread_History` and `Logs_DoNotEdit`.

## Verification Plan
- [ ] Dry run logic with `console.log`.
- [ ] Test `STATUS_ORDER` comparison.
- [ ] Verify remark concatenation format.

---

## Implementation Notes

### Changes Made
1. **Enhanced CONFIG**: Added column indices for Database sheet (Email, Remarks, Is_Active) and Tracker sheet (Status, PIC, Last Contact, Remarks, Last Update).

2. **STATUS_ORDER**: Defined priority ranking for statuses (Completed=7, Interested=6, Negotiating=5, Contacted=4, To Contact=3, No Reply=2, Rejected=1).

3. **mergeTrackerRows()**: 
   - Compares statuses and selects the higher priority one
   - Concatenates remarks with source ID labels and timestamp
   - Inherits PIC if the keep row is missing it
   - Selects the most recent timestamps for Last Contact and Last Update
   - Returns merged row data array

4. **deduplicateContacts()**:
   - Groups contacts by email for the specified company ID
   - Sorts duplicates by: Active status first, then by filled field count
   - Merges remarks from duplicate contacts
   - Deletes redundant rows in reverse order to maintain indices

5. **Updated mergeAndShift()**:
   - Reordered operations: Smart merge tracker rows BEFORE database updates
   - Calls `mergeTrackerRows()` to intelligently merge data
   - Writes merged data back to the keepId tracker row
   - Calls `deduplicateContacts()` after updating database IDs
   - Improved variable naming and flow clarity

### Key Design Decisions
- **Remark Format**: Uses `[ID]: content` format with merge timestamp for traceability
- **Contact Priority**: Active contacts take precedence, then those with more complete information
- **Deletion Order**: Rows deleted in reverse order to prevent index shifting issues
- **Logging**: Comprehensive console.log statements for debugging and audit trail

### Testing Recommendations
1. Test with companies that have different statuses (verify priority selection)
2. Test with companies that have remarks in both IDs (verify concatenation)
3. Test with duplicate contacts (same email) to verify deduplication
4. Test with contacts having varying levels of completeness
5. Verify ID shifting works correctly for IDs > removeId
