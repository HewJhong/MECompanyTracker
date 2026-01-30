# Outreach Tracker Design Document
**Date:** 2026-01-29
**Status:** DRAFT

## 1. Overview
The **Outreach Tracker** is a hybrid web application designed to replace the manual, prone-to-staleness process of tracking company outreach statuses via raw Google Sheets.
It provides a modern, "Command Center" dashboard for high-level visibility and a focused "Committee Workspace" for members to update statuses efficiently.

**Key constraint:** The existing Google Sheet must remain the primary database to minimize transitional friction and allow raw access if needed.

## 2. Architecture

### 2.1 Hybrid Model
*   **Frontend:** Next.js Web App (React) hosted on **Google Cloud Run** (Dockerized).
*   **Backend/Database:** Google Sheets (located in a Shared Drive).
*   **Connectivity:** Google Sheets API v4 via a Service Account.

### 2.2 Data Flow
1.  **Read:** On page load/refresh, the app fetches high-level metrics and committee-specific data from the Sheet.
2.  **Write:** User actions (updates, remarks) are sent to the Sheet immediately.
3.  **Sync:** "Optimistic UI" updates ensure the app feels instant, while background processes handle the API latency.

## 3. User Experience & Workflows

### 3.1 Roles
1.  **Committee Member:** Focused on executing outreach. Needs to see *only* their assigned companies and update them quickly.
2.  **Committee Lead / Admin:** Needs high-level visibility on progress, stalled items, and issues requiring attention.

### 3.2 The Dashboard (Command Center)
*   **Target:** Leads/Higher Committees.
*   **Key Metrics:**
    *   Overall Completion % (Companies Contacted / Total).
    *   Response Rate %.
    *   Stalled Items (No update > 7 days).
    *   **Flagged Items:** Specific section for "Requests for Attention".
    *   **Committee Leaderboard:** Bar chart of progress per committee.
    *   **Member Activity Monitor:** List of members showing "Last Active" time. Flag members idle for > X days.

### 3.3 The Committee Workspace
*   **Target:** Committee Members.
*   **View:** "My Assignments". Filters out all noise.
*   **Layout:** Kanban or Status List (To Contact -> Contacted -> Negotiating -> Closed).
*   **Performance:** Highlights "Action Needed" rows (stale updates) in yellow/red.

### 3.4 The "Case File" Workflow (Detailed Updates)
Replacing the single-cell update with a rich modal:
1.  **Trigger:** Click on a company card/row.
2.  **Update Details:**
    *   Change Status (Dropdown).
    *   **Add Remark:** Text area for specific context ("Sent follow-up email").
    *   **History Log:** Scrollable list of past remarks + timestamp + user (read from specific columns or a log sheet).
3.  **Request Attention (Flag):**
    *   Toggle switch: "Request Advisor/Lead Help".
    *   Effect: Highlights row on Dashboard, adds visual flag.
4.  **Manage Contacts:**
    *   **View:** list of existing contacts (aggregated from all rows for this company).
    *   **Add:** Button to "Add New Contact".
    *   **Storage:** **Inserts a NEW ROW** into the Google Sheet.
        *   **Grouping:** Copies `Company Name` (Critical).
        *   **Numbering:** Copies the `No.` from the existing row (so they share the same ID).
        *   **Data:** Fills the new Contact columns (`Company PIC`, `Phone`, `Email`).
        *   **Status:** Copies current `Status` and `PIC` (Committee Member) to keep them in sync.

### 3.5 All Companies Database View
*   **Target:** Admins/Leads (and Members searching for specific entries).
*   **Visual:** A powerful, dense Data Table (replacing the raw Sheet view).
*   **Capabilities:**
    *   **Search:** Instant search by Company Name or Contact Person.
    *   **Filtering:** By Committee Member, Status, or "Stale" state.
    *   **Sorting:** By "Last Updated" (descending) to see recent activity.
    *   **Export:** Option to download filtered view as CSV (backwards compatibility).

## 4. Google Sheet Structure Plan
To support this without breaking the sheet for manual users:

### 4.1 Main Sheet Columns
We will strictly adhere to the existing column structure, appending new system columns at the end.

**Existing Columns:**
1.  `No.`
2.  `Company Name` (Primary Grouping Key)
3.  `Discipline` (MEC, CHE, CIV, ECSE, CS, SW, DS, etc.)
4.  `Prioritised/Normal` (For targeted OP & Gold Sponsors)
5.  `Status` (Kanban State: To Contact, Contacted, Negotiating, Closed, etc.)
6.  `Previous Response` (Joined 2024, Joined 2025, No Response, Rejected)
7.  `Company PIC` (Contact Person Name)
8.  `Email`
9.  `Phone Number`
10. `Landline Number`
11. `Linkedin`
12. `Reference` (Referred by Lecturer, Student, etc.)
13. `Remarks` (Latest Remark)
14. `PIC` (Committee Member Assignment)

**Required New Columns (Appended):**
15. `Last Updated` (Timestamp): Essential for the "Staleness" logic.
16. `Is Flagged` (Checkbox): Stores the "Request Attention" state.

### 4.2 Data Mapping
*   `PIC` Column -> **Committee Member** (Filters the "My Assignments" view).
*   `Status` Column -> **Kanban Status**.
*   `Company Name` -> **Title** (Primary Key for Grouping).
    *   **Logic:** The App **Groups** multiple rows with the same `Company Name` into a single "Company Entity".
*   **New "System" Tabs (Hidden):**
    *   `Logs_DoNotEdit`: Appends every change made via the app `[Timestamp, User, CompanyID, Field, OldVal, NewVal, Remark]`.
    *   `Thread_History`: Stores the "Remark" history if the main sheet only keeps the "Latest Remark".
    *   `Committee_Status`: Minimal table `[MemberName, LastActiveTimestamp]` for fast dashboard checks.

## 5. Feasibility & Technical Risks
*   **Risk:** Google Sheets API Rate Limits.
    *   **Limits:** The API has a quota of **60 requests per minute per user** (and 300 per minute per project).
    *   *Constraint:* Since our Web App uses a single Service Account, the entire application is effectively limited to **60 requests per minute** total for the backend.
    *   *Mitigation:* 
        *   **Server-Side Caching:** The Next.js server will cache Sheet data for 60 seconds. Users hitting the site see cached data, preventing us from hitting the API on every page load.
        *   **Optimistic UI:** Write actions (updates) appear instantly to the user, but are queued and sent to the API one by one to avoid bursts.
*   **Risk:** Reading "History" from a flat sheet.
    *   *Approach:* We will need to define if we parse the "Comment" cell (if people manually append) or strictly use the new `Logs` tab for history going forward.
*   **Risk:** Concurrent Edits.
    *   *Mitigation:* Last-write-wins is acceptable for this use case, but the Log tab ensures no data is truly lost.

## 6. Next Steps
1.  Finalize "History" data structure (Cell-based vs Log-based).
2.  Initialize Next.js Project.
3.  Set up Google Service Account & Shared Drive Access.

## 7. User Stories

### Committee Lead / Admin
*   **Views Dashboard (Command Center)**
    *   Navigate to dashboard homepage.
    *   Verify 'Total Progress', 'Response Rate' & 'Stalled Items' cards show correct data.
    *   Verify 'Member Activity Monitor' lists members with "last active" timestamps.
    *   Verify 'Flagged Items' section lists companies requesting attention.

### Committee Member
*   **Views Personal Workspace**
    *   Navigate to Committee Workspace and select own name.
    *   Verify Kanban/List shows *only* assigned companies.
    *   Verify "Stale" companies (> 7 days) are highlighted.
*   **Updates Company Status ('Case File')**
    *   Click company card -> Open Modal.
    *   Updates status (e.g., 'Contacted') and adds remark ('Sent initial email').
    *   Verifies Modal closes, card moves column.
    *   **System Action:** Timestamp on Sheet updates to NOW.
*   **Flags Company for Attention**
    *   Open Modal -> Toggle 'Request Attention'.
    *   Verify company appears in 'Flagged Items' on Dashboard.
*   **Adds New Contact Person**
    *   Open Company Modal -> "Contacts" tab/section.
    *   Click "Add Contact" -> Enter Type (Phone), Name (Jane), Value (555-0199).
    *   Click "Save".
    *   Verify contact appears in the list and is saved to the backend.
