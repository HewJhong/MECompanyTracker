# Implementation Plan - Merge 'Replied' into 'Negotiating' Status

The goal is to simplify the outreach workflow by merging the "Replied" status into "Negotiating". This avoids visual inconsistencies and reduces the number of statuses to manage.

## User Review Required

> [!NOTE]
> Logging a company reply will now automatically set the company status to **'Negotiating'** instead of 'Replied'.

## Proposed Changes

### Frontend Components

#### [MODIFY] [id].tsx(file:///Users/jinhong/Documents/My Projects/ME Company Tracker/outreach-tracker/pages/companies/[id].tsx)
- In `handleLogCompanyReply`, change `setStatus('Replied')` to `setStatus('Negotiating')`.
- Remove any references to `'Replied'` in logic if they exist (searching reveals it's mainly used in `statusOptions` or as a target status).

#### [MODIFY] [index.tsx](file:///Users/jinhong/Documents/My Projects/ME Company Tracker/outreach-tracker/pages/index.tsx)
- Update `responseCount` calculation to remove `'Replied'` from the array of statuses that count as a response: `['Negotiating', 'Closed', 'Succeeded', 'Interested', 'Completed']`. (Note: 'Interested' and 'Completed' should also be included as they are further stages).
- Update `leaderboardMembers` calculation (in `memberStatsMap`) to similarly exclude `'Replied'`.

#### [MODIFY] [InteractionSection.tsx](file:///Users/jinhong/Documents/My Projects/ME Company Tracker/outreach-tracker/components/InteractionSection.tsx)
- Verify `isOurReplyVisible` includes `'Negotiating'`. (It already does).

## Verification Plan

### Manual Verification
1. Open a company detail page (e.g., `/companies/ME-0001`).
2. Log a company reply using the "Interaction Section".
3. Verify that the "Update Status" dropdown correctly shows **'Negotiating'**.
4. Save the changes and verify that the status persists as **'Negotiating'**.
5. Navigate to the "Command Center" (Dashboard) and verify that the "Response Rate" and stats correctly include this company under responses.
6. Verify that the status color for 'Negotiating' is correctly applied (Amber).
