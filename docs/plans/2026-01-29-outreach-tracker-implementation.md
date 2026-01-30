# Outreach Tracker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a "Hybrid" Outreach Tracker Web App using Next.js and Google Sheets, deploying to Google Cloud Run.

**Architecture:** Next.js (Frontend/Backend) + Google Sheets API (Database).
**Deployment:** Containerized (Docker) on Google Cloud Run.
**Tech Stack:** Next.js, TailwindCSS, `googleapis`, `lru-cache` (for server caching).

---

## Phase 1: Setup & Data Connection

### Task 1: Project Initialization
**Files:**
- Create: `outreach-tracker/package.json`
- Create: `outreach-tracker/tsconfig.json`
- Create: `outreach-tracker/tailwind.config.js`

**Step 1: Init Next.js App**
Run: `npx -y create-next-app@latest outreach-tracker --typescript --tailwind --eslint --no-src-dir --import-alias "@/*"`

**Step 2: Verify Install**
Run: `cd outreach-tracker && npm run dev`
Expected: Server starts on 3000.

**Step 3: Commit**
Run: `git add . && git commit -m "init: nextjs project"`

### Task 2: Google Sheets API Setup
**Files:**
- Create: `outreach-tracker/lib/google-sheets.ts`
- Create: `outreach-tracker/.env.local`

**Step 1: Install Dependencies**
Run: `cd outreach-tracker && npm install googleapis`

**Step 2: Create Service Account config**
Create `.env.local` with `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `SPREADSHEET_ID`.

**Step 3: Implement Auth Client**
Write `lib/google-sheets.ts` to export an authenticated Google Sheets client.

**Step 4: Verify Connection Script**
Create `scripts/test-sheet-connection.js` to try fetching metadata from the sheet.
Run: `node scripts/test-sheet-connection.js`
Expected: Output Sheet Title and Sheet ID.

**Step 5: Commit**
Run: `git add . && git commit -m "feat: google sheets auth setup"`

---

## Phase 2: Core Backend & Caching

### Task 3: Data Fetching API with Caching
**Files:**
- Create: `outreach-tracker/pages/api/data.ts`
- Modify: `outreach-tracker/lib/cache.ts`

**Step 1: Install Cache Lib**
Run: `cd outreach-tracker && npm install lru-cache`

**Step 2: Implement LRU Cache**
Write `lib/cache.ts` to singleton instance of LRICache (60s TTL).

**Step 3: Create Read API**
Write `pages/api/data.ts`:
- Check Cache -> Return if hit.
- Else -> Fetch Sheet.
- **Transform:** Group rows by `Company Name`. Output: `[{ company: "Tesla", status: "Pending", contacts: [Row1, Row2] }]`.
- Store Cache -> Return.

**Step 4: Test API**
Run: `curl http://localhost:3000/api/data`
Expected: JSON response with grouped companies.

**Step 5: Commit**
Run: `git add . && git commit -m "feat: backend api with caching and grouping"`

### Task 4: Write Operations API
**Files:**
- Create: `outreach-tracker/pages/api/update.ts`

**Step 1: Create Update API**
Write `pages/api/update.ts` to handle POST requests:
- Params: `companyName`, `column`, `newValue`, `user`.
- Action: Find **ALL** rows matching `companyName`.
- Action: Batch Update those rows in Sheet.
- Action: Update `Last Updated` column (Col 15) to `NOW()`.
- Action: If `isFlagged` is provided, update `Is Flagged` column (Col 16).
- Action: Append to `Logs_DoNotEdit`.
- Action: If `remark` is provided, append to `Thread_History` [Timestamp, Company, User, Remark].
- Action: Upsert `Committee_Status`.

**Step 2: Test Write**
Run: `curl -X POST ...`
Expected: 200 OK. Verification: Check Sheet (multiple rows updated).

**Step 3: Commit**
Run: `git add . && git commit -m "feat: write api with batch update"`

---

## Phase 3: Frontend Implementation

### Task 5: Dashboard UI & Data Integration
**Files:**
- Create: `outreach-tracker/components/DashboardStats.tsx`
- Modify: `outreach-tracker/pages/index.tsx`
- Modify: `outreach-tracker/pages/api/data.ts`

**Step 1: Create Stat Cards & UI**
Implement UI cards for "Total Progress", "Stalled", "Referrals", and "Flagged Items".

**Step 2: Implement Real Data Sync**
- Modify `pages/api/data.ts` to fetch history from `Thread_History` and return grouped data.
- Update `pages/index.tsx` to derive `MemberActivity` and `CommitteeLeaderboard` directly from spreadsheet data.
- Remove all hardcoded mock stats/members.

**Step 3: Commit**
Run: `git add . && git commit -m "feat: dashboard UI and real-time data integration"`

### Task 6: Committee Workspace (Kanban/List)
**Files:**
- Create: `outreach-tracker/components/CommitteeView.tsx`

**Step 1: Create Filterable List**
Component receiving all data but filtering by `committeeMember` prop.

**Step 2: Implement "Status" Color Coding**
Logic to color code rows based on "My Assignment" + "Stale > 7 days".
Highlight rows where `Is Flagged` is TRUE.

**Step 3: Commit**
Run: `git add . && git commit -m "feat: committee workspace"`

### Task 7: All Companies Master Table
**Files:**
- Create: `outreach-tracker/components/AllCompaniesTable.tsx`
- Modify: `outreach-tracker/pages/all-companies.tsx`

**Step 1: Install Table Lib**
run: `npm install @tanstack/react-table` (for headless sorting/filtering).

**Step 2: Implement Table Component**
Columns: Name, Status, Committee PIC, Last Updated, Actions.
Features: Search Input (global filter), Filter Dropdowns (Status, PIC), Sorting Headers.

**Step 3: Commit**
Run: `git add . && git commit -m "feat: all companies interactive table"`

### Task 8: "Case File" Modal & History Sync
**Files:**
- Create: `outreach-tracker/components/CompanyModal.tsx`

**Step 1: Modal UI**
Dialog showing Company Details, Status Dropdown, Remarks Textarea.

**Step 2: Sync Real History**
- Connect modal to use the `Thread_History` data returned by the API.
- Remove mock history rows.

**Step 3: Connect Update API**
On Save -> Call `/api/update` with optimistic updates.

**Step 4: Commit**
Run: `git add . && git commit -m "feat: company modal with real interaction history"`

### Task 9: Contact Management Feature
**Files:**
- Create: `outreach-tracker/pages/api/add-contact.ts`
- Modify: `outreach-tracker/components/CompanyModal.tsx`

**Step 1: Create Add Contact API**
Write `pages/api/add-contact.ts`:
- Params: `companyName`, `newContactDetails`.
- Logic: Find first row of `companyName` to get common fields (`PIC`, `Status`).
- Logic: **Insert New Row** with common fields + new contact details.
- Logic: **Copy Data Validation:** Ensure the new row inherits the Dropdown/Validation rules from the row above so the Sheet stays clean.

**Step 2: Implement UI Component**
"Add Contact" form in Modal.

**Step 3: Integrate**
On Save -> Call `/api/add-contact`. Update local grouped state.

**Step 4: Commit**
Run: `git add . && git commit -m "feat: contact management with row insertion"`

### Task 10: Analytics & Settings Pages
**Files:**
- Create: `outreach-tracker/pages/analytics.tsx`
- Create: `outreach-tracker/pages/settings.tsx`

**Step 1: Implement Analytics Page**
- Create `pages/analytics.tsx` with charts showing outreach progress, response rates, and performance.
- Use existing design patterns (Glassmorphism, dark/slate theme).

**Step 2: Implement Settings Page**
- Create `pages/settings.tsx` with user profile and application configuration options.

**Step 3: Commit**
Run: `git add . && git commit -m "feat: analytics and settings pages"`

### Task 11: Docker Configuration
**Files:**
- Create: `outreach-tracker/Dockerfile`
- Create: `outreach-tracker/.dockerignore`

**Step 1: Create Dockerfile**
Standard Next.js standalone output Dockerfile.
- `output: 'standalone'` in `next.config.js`.

**Step 2: Build Locally**
Run: `docker build -t outreach-tracker .`
Expected: Successful build.

**Step 3: Commit**
Run: `git add . && git commit -m "chore: docker configuration"`

### Task 12: Deployment Scripts
**Files:**
- Create: `outreach-tracker/deploy.sh`

**Step 1: Write Deploy Script**
Commands to:
1. `gcloud builds submit --tag gcr.io/[PROJECT-ID]/outreach-tracker`
2. `gcloud run deploy outreach-tracker --image ... --platform managed`

**Step 2: Documentation**
Add `DEPLOY.md` explaining how to set Env Vars in Cloud Run UI.

**Step 3: Commit**
Run: `git add . && git commit -m "chore: deployment scripts"`

### Task 13: Company & Contact Modification
**Files:**
- Modify: `outreach-tracker/pages/api/update.ts`
- Create: `outreach-tracker/pages/api/update-contact.ts`
- Modify: `outreach-tracker/components/CompanyModal.tsx`
- Modify: `outreach-tracker/pages/companies.tsx`

**Step 1: Expand Update API**
Update `pages/api/update.ts`:
- Expand `COL_MAP` to include `discipline` (Col C) and `priority` (Col D).
- Support renaming companies (update all rows with matching `oldCompanyName`).

**Step 2: Create Contact Update API**
Write `pages/api/update-contact.ts`:
- Params: `rowNumber`, `updates` (name, email, phone, linkedin, etc.).
- Action: Update specific row.

**Step 3: Implement Modal Edit Mode**
Update `components/CompanyModal.tsx`:
- Add "Edit Mode" toggle.
- Replace static text with input/select fields in Edit Mode.
- Add "Edit" functionality for individual contacts.

**Step 4: Integrate Frontend**
Update `pages/companies.tsx`:
- Update `handleSaveCompany` to pass full update payload.
- Ensure state refresh on success.

**Step 5: Commit**
Run: `git add . && git commit -m "feat: company and contact modification"`

---

## Implementation Notes

### Completed Tasks (2026-01-29)

#### Phase 2 & 3 Updates - Mock Data Removal & Analytics/Settings Pages

**Task: Remove Mock Data and Use Real Data from Spreadsheet**
- ✅ Updated `/api/data.ts` to fetch Thread_History data from the `Thread_History` sheet
- ✅ Modified API response structure to return both `companies` and `history` data
- ✅ Removed all mock data from `index.tsx`:
  - Replaced `mockMembers` with real member activity calculated from Thread_History
  - Replaced `leaderboardMembers` with real statistics calculated from company data
  - Replaced mock history in CompanyModal with real Thread_History data
- ✅ Updated `companies.tsx` to fetch and display real data from the API
- ✅ Updated `committee.tsx` to fetch and display real data filtered by current user
- ✅ All pages now use actual data from Google Sheets

**Task: Create Analytics Page**
- ✅ Created `pages/analytics.tsx` with comprehensive metrics and visualizations:
  - Key metrics cards (Total Companies, Contacted, Response Rate, Success Rate)
  - Status distribution chart with visual progress bars
  - 7-day activity timeline bar chart
  - Top performers leaderboard with scoring system
  - Companies by discipline breakdown
- ✅ All analytics calculations based on real spreadsheet data
- ✅ Consistent design with existing pages (slate theme, glassmorphism elements)

**Task: Create Settings Page**
- ✅ Created `pages/settings.tsx` with four main sections:
  - Profile: Name, email, role, timezone settings
  - Notifications: Email updates, flagged items, daily digest, weekly report toggles
  - Security: 2FA setup, password change, account deletion
  - Appearance: Theme selection (light/dark/auto), compact mode, avatar display
- ✅ Tab-based navigation for better organization
- ✅ Save functionality with loading and success states
- ✅ Follows existing design patterns

**Navigation Updates**
- ✅ Analytics and Settings pages are accessible from the sidebar navigation (already configured in Layout component)

**Data Structure Changes**
- API now returns: `{ companies: [...], history: [...] }`
- Each company object includes a `history` array with entries from Thread_History
- Member activity is derived from Thread_History timestamps
- Leaderboard statistics are calculated from company assignments and status

**Technical Notes**
- No linter errors detected in any modified files
- All components properly handle loading states
- Error handling implemented for API calls
- Thread_History sheet is optional (graceful fallback if not present)

**Future Considerations**
- User authentication system to identify current logged-in user (currently hardcoded as "Ryan Chen" in committee page)
- Settings page functionality to be connected to backend for persistence
- Real-time updates or polling mechanism for live data refresh
- Performance optimization for large datasets (pagination, virtualization)
