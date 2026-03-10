# Implementation Plan: Admin View All Logs

## Goal Description
Add a new section in the Analytics page to allow Admins (or Committee Members) to view all history logs from all committee members. This will help them understand the current progress and active status of each member's outreach efforts. The data for these logs is already being fetched from the backend via the `history` array.

## User Review Required
Does the "All Logs" view need to be restricted strictly to `Admin` role users, or should any `Committee Member` be able to see it? Currently, the plan adds it to the existing `currentUser?.isCommitteeMember` block. Let me know if you want an explicit check for `currentUser?.role === 'Admin'` for this specific new section.

## Proposed Changes

### Frontend Component updates
#### [MODIFY] `pages/analytics.tsx`
- **Role Restriction**: 
  - Ensure the "All Logs" view is only rendered if `currentUser?.role === 'Admin'`.
- **State Additions**: 
  - Add `selectedUserFilter` state to allow filtering logs by a specific committee member.
- **Data Processing**:
  - Add a memoized value `processedLogs` that takes the existing `history` dataset, sorts it by timestamp (newest first), and filters it by `selectedUserFilter` if one is active.
  - Map the `companyId` in each history entry to the actual `companyName` using the `data` array for better readability.
- **UI Details**:
  - Add a new full-width container `div` below the existing "Team & Admin Section" grids.
  - The header will have the title "Recent Activity Logs" and a dropdown `<select>` to filter by user (populated from the existing `stats.realMembers` or `committeeMembers` list).
  - The body will be a scrollable table (`max-h-96`) displaying columns:
    - **Date & Time** (formatted nicely)
    - **Member Name**
    - **Company Name**
    - **Action / Remark**

## Verification Plan

### Automated Tests
- Since there are no existing test suites mentioned for UI rendering, no automated tests correspond directly to this modification. Type checks and build will be verified (`npm run build`).

### Manual Verification
1. Navigate to the `/analytics` page as an Admin user.
2. Scroll to the bottom of the page to find the "Recent Activity Logs" section.
3. Verify that the table populates with the latest logs sorted from newest to oldest.
4. Verify that the Action / Remark column displays the correct updates.
5. Use the user filter dropdown to select a specific committee member and verify that the table only shows their logs.
6. Verify that the company names are correctly matched to the logs.
