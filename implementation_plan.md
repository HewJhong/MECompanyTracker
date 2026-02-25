# Implementation Plan - Status Refactor & Dashboard Update

## User Review Required
> [!IMPORTANT]
> **Data Migration**: I will create a script `scripts/migrate-statuses.js` to automatically update the Google Sheet data:
> - `Completed` → `Registered`
> - `Negotiating` → `Interested`

> [!NOTE]
> **Clarification on "Negotiating"**: You mentioned combining "Negotiating" into "Interested", but also listed "Negotiating" in the requested stats.
> **Assumption**: I will proceed with **combining them into "Interested"** as requested in the first part of your instruction. The stats will show "Interested" instead of "Negotiating".

> [!TIP]
> **Day Attendance Data**: 
> - **Source**: Column K (index 10) in the Outreach Tracker sheet.
> - **Format**: Comma-separated strings (e.g., "2,4").
> - **Metrics**: I will parse this to show a distribution of companies attending Day 1, Day 2, etc.

## Proposed Dashboard Layout (ASCII Design)

```text
+-----------------------------------------------------------------------+
|  Outreach Dashboard                                [Refresh Button]   |
+-----------------------------------------------------------------------+
|                                                                       |
|  [ KEY METRICS ROW ]                                                  |
|                                                                       |
|  +----------------+  +----------------+  +-------------------------+  |
|  | Outreach Prog. |  | Total Follow-up|  | Outreach Breakdown      |  |
|  |     (65%)      |  |      124       |  |                         |  |
|  |    130/200     |  |   Activities   |  | [====] No Reply (70)    |  |
|  |    Reached     |  |                |  | [==]   Interested (20)  |  |
|  +----------------+  +----------------+  | [=]    Registered (10)  |  |
|                                          +-------------------------+  |
|                                                                       |
+-----------------------------------------------------------------------+
|                                                                       |
|  [ CHARTS ROW 1 ]                                                     |
|                                                                       |
|  +-----------------------+   +-----------------------+                |
|  | Sponsorship Dist.     |   | Discipline Dist.      |                |
|  |        (Pie)          |   |        (Bar)          |                |
|  | [##] Gold (2)         |   | MEC  [======] 15      |                |
|  | [####] Silver (4)     |   | ECSE [====] 10        |                |
|  | [######] Bronze (6)   |   | CS   [==] 5           |                |
|  +-----------------------+   +-----------------------+                |
|                                                                       |
+-----------------------------------------------------------------------+
|                                                                       |
|  [ CHARTS ROW 2 ]                                                     |
|                                                                       |
|  +-----------------------+   +-----------------------+                |
|  | Day Attendance        |   | Outreach Timeline     |                |
|  |        (Bar)          |   |        (Line)         |                |
|  | Day 1 [=======] 20    |   |Count                  |                |
|  | Day 2 [=====] 15      |   |  |   /                |                |
|  | Day 3 [===] 10        |   |  |__/___ Time         |                |
|  +-----------------------+   +-----------------------+                |
|                                                                       |
+-----------------------------------------------------------------------+
|                                                                       |
|  [ ADMIN SECTION ] (Authorized Users Only)                            |
|                                                                       |
|  +-----------------------------------------------+                    |
|  | Committee Leaderboard                         |                    |
|  +-----------------------------------------------+                    |
|  | Name          | Registered | Outreach %       |                    |
|  +---------------+------------+------------------+                    |
|  | Alice         |      5     |      80%         |                    |
|  | Bob           |      3     |      45%         |                    |
|  | Charlie       |      1     |      10%         |                    |
|  +-----------------------------------------------+                    |
|                                                                       |
|  +-----------------------------------------------+                    |
|  | Flagged Companies                             |                    |
|  +-----------------------------------------------+                    |
|  | Company A: "Need to reply asap"               |                    |
|  | Company B: "Incorrect email"                  |                    |
|  +-----------------------------------------------+                    |
|                                                                       |
+-----------------------------------------------------------------------+
```

## Proposed Changes

### 1. Status Refactoring & Migration

#### [x] [scripts/migrate-statuses.js](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/scripts/migrate-statuses.js)
- [x] Script created and executed.
- [x] Corrected for new sheet headers and column indices.

#### [x] [companies/[id].tsx](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/pages/companies/[id].tsx)
- [x] Updated `statusOptions`.
- [x] Renamed `Completed` → `Registered`.
- [x] Updated validation and history logging logic.

#### [x] [AllCompaniesTable.tsx](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/components/AllCompaniesTable.tsx)
- [x] Updated `getStatusColor` mapping.

#### [x] [pages/api/data.ts](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/pages/api/data.ts)
- [x] Parsed `daysAttending` field (now Column L).
- [x] Fixed column mapping for `sponsorshipTier` (now Column K).
- [x] Verified data flow to frontend.

### 2. Dashboard Implementation (analytics.tsx)

#### [x] [analytics.tsx](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/pages/analytics.tsx)
- [x] Implemented premium UI with gauges and mini-charts.
- [x] Added Day Attendance bar chart.
- [x] Added Outreach Timeline (30 days cumulative).
- [x] Added Committee Leaderboard and Flagged Companies list.
- [x] Renamed metrics as requested ("Outreach Breakdown", "Total Follow-up").

## Verification Plan

### Automated Tests
- None.

### Manual Verification
1.  **Migration**:
    - Run `node scripts/migrate-statuses.js`.
    - Verify Google Sheet reflects changes.
2.  **Dashboard**:
    - Check `/analytics` page.
    - Verify "Day Attendance" chart correctly reflects the comma-separated values in the sheet.
    - Verify all other numbers match manual counts.
4.  **Column Alignment**:
    - Verified Column K is Sponsorship Tier and Column L is Days Attending in the current sheet.
    - Updated API to fetch up to Column N.

## Implementation Notes
- **Status Migration**: Ran script against the new sheet; found 0 rows needing update (all rows seem to already be in clean status state or "Interested").
- **Day Attendance**: Visualization handles up to 5 days.
- **Timeline**: Heuristic based on history log text filtering for "Contacted", "Interested", "Registered", "Outreach", etc.
- **Admin View**: Only visible to users with `isCommitteeMember` role.
