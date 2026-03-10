# Implementation Plan: Improve History Logs Context

## Goal Description
The history logs currently use a hardcoded `[System Update]` prefix when users manually update company details via the UI. The user wants to change this to reflect that it is a *user* action (e.g., `[Company Update]`) and ensure other actions like updating contacts also have clear, contextual prefixes.

## Proposed Changes

### Frontend Component Updates
#### [MODIFY] `pages/companies/[id].tsx`
- **Company Details Update (`handleSave`)**:
  - Replace `[System Update]: ` with `[Company Update]: ` when assembling the `auditLog` string.
  - Apply the same change to the "Name changed" fallback block.
- **Contact Updates (`handleUpdateContact`)**:
  - Update the `historyLog` assembly to prefix the message with `[Contact Update]:`. Instead of `Updated contact John: Role...`, it will be `[Contact Update]: John - Role...`.
- **Contact Addition (`handleContactAction`)**:
  - Prefix the history log string with `[Contact Added]:`. E.g., `[Contact Added]: Jane Doe (CEO)`.
- **Follow-Up Reset (`handleResetFollowUps`)**:
  - Replace `[System] Follow-up counter reset by user` with `[User Update]: Follow-up counter reset`.

## Verification Plan

### Manual Verification
1. Open a company details page.
2. Edit their details (e.g., changing their Target Sponsorship Tier) and click "Update Status" and verify that the resulting Thread History entry says `[Company Update]: Target Tier...` instead of `[System Update]`.
3. Add a new contact and verify the history log shows `[Contact Added]`.
4. Update an existing contact and verify the history log shows `[Contact Update]`.
