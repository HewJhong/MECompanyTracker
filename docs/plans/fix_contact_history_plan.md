# Plan: Fix Contact History Logging

The "History" tab tracks company interactions and updates. Currently, contact updates (edit) are not logged at all, and deletions are logged generically ("Deleted contact row X").

We will enhance the history logging by generating descriptive change summaries on the frontend and sending them to the backend to be recorded in the `Thread_History` sheet.

## Phase 1: API Updates
- [x] **Modify `pages/api/update-contact.ts`**
    - [x] Accept an optional `historyLog` string in the request body.
    - [x] If `historyLog` is present, append a row to the `Thread_History` sheet with: `[timestamp, companyId, user, historyLog]`.
- [x] **Modify `pages/api/delete-contact.ts`**
    - [x] Accept an optional `contactName` or `historyLog` string in the request body.
    - [x] Update the logging logic to use the provided log message (e.g., "Deleted contact: [Name]") instead of the generic "Deleted contact row X" if available.

## Phase 2: Frontend Integration
- [x] **Modify `pages/companies/[id].tsx`**
    - [x] Update `handleUpdateContact`:
        - [x] Calculate a diff between the old contact data and the `updates`.
        - [x] Generate a human-readable summary string (e.g., "Updated contact Alice: Changed email, role").
        - [x] Pass this string as `historyLog` in the API payload.
    - [x] Update `confirmDeleteContact`:
        - [x] Generate a log message: "Deleted contact: [Contact Name]".
        - [x] Pass this message in the API payload.

## Verification
- [x] **Manual Test**:
    - [x] Open a company detail page.
    - [x] Edit a contact (e.g., change email or role).
    - [x] Save.
    - [x] Check the "History" tab in the UI. It should show a new entry like "Updated contact [Name]: Changed ...".
    - [x] Verify the entry persists after refresh.
    - [x] Delete a dummy contact.
    - [x] Check the "History" tab. It should show "Deleted contact: [Name]".
