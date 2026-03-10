# Implementation Plan - Follow Ups Column

This plan outlines the steps to add a "Follow Ups Completed" column to the company tracker to improve outreach tracking and prioritization.

## Proposed Changes

### 1. Data Layer (Google Sheets) [x]
- **Column Addition**: Add a new column "Follow Ups Completed" to the main Google Sheet. [x]
- **Location**: Column Q (Index 16). [x]
- **Initialization**: Existing rows should be initialized with `0`. [x]

### 2. Backend API [x]
#### [MODIFY] [data.ts](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/pages/api/data.ts) [x]
- Update fetching to include `followUpsCompleted` (Col Q) and `lastCompanyActivity` (Col R - New). [x]
- Map these to the company object. [x]
- **Dual Stall Logic**: [x]
    - `isCommitteeStalled`: `now - lastUpdated (manual) > 7 days`. [x]
    - `isCompanyStalled`: `now - lastCompanyActivity > 7 days` (while in 'Contacted' status). [x]

#### [MODIFY] [update.ts](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/pages/api/update.ts) [x]
- Add `'followUpsCompleted': 'Q'` and `'lastCompanyActivity': 'R'` to `COL_MAP`. [x]
- Logic for **Mark as Replied**: Updates `lastCompanyActivity` AND status. [x]
- Logic for **Log Follow-up**: Updates `lastUpdated` (manual) AND increments count. [x]

### 3. Frontend Components [x]
#### [MODIFY] [CompanyDetailPage.tsx](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/pages/companies/%5Bid%5D.tsx) [x]
- Display dual status indicators: [x]
    - 🔴 **Action Needed**: We haven't touched this in 7+ days. [x]
    - ⏳ **Awaiting Reply**: They haven't replied in 7+ days (Ready for follow-up). [x]
- **Log Follow-up**: Refreshes our action timer and increments count. [x]
- **Mark as Replied**: Refreshes their activity timer. [x]

#### [MODIFY] [Dashboard (pages/index.tsx)](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/pages/index.tsx) [x]
- Split "Stalled" metric into: [x]
    - **Internal Bottlenecks**: Committee members needing to update their rows. [x]
    - **Follow-ups Due**: Companies waiting for our next nudge. [x]

#### [MODIFY] [DashboardStats.tsx](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/components/DashboardStats.tsx) [x]
- Replace generic "Stalled" card with two specific cards: "Committee Inactive" and "Follow-ups Due". [x]

## Why Separate Stall Tracking? [x]
Having two separate systems is **highly relevant** for the following reasons:
1. **Bottleneck Identification**: Escalations can be handled differently. If a committee is stalled, we need to check on the member. If a company is stalled, we need to refine the outreach script or try a different contact. [x]
2. **Support for AI Automation**: When the AI updates a remark/timestamp, it shouldn't "forgive" a committee member who hasn't touched the lead. Conversely, a committee member's manual update shouldn't mask the fact that a company hasn't replied in weeks. [x]
3. **Prioritization**: High-priority companies that are "Company Stalled" should be the first ones to receive manual, personalized follow-ups. [x]

## Implementation Notes for AI Integration [x]
- The AI automation should be instructed to update the `lastCompanyActivity` (Column R) when it detects an email. [x]
- This will automatically trigger the "Action Needed" status for the committee member to respond to the new email. [x]

## Verification Plan [x]
### Manual Verification [x]
1. **Google Sheet**: Verify Columns Q and R are added and initialized. [x]
2. **Company Detail**: [x]
   - Test **Log Follow-up**: Ensure count increments and internal timer resets. [x]
   - Test **Mark as Replied**: Ensure external timer resets. [x]
3. **All Companies Table**: Verify the "Follow Ups" column displays correct data and is sortable. [x]
4. **Dashboard**: Verify "Committee Inactive" and "Follow-ups Due" cards are accurate. [x]
