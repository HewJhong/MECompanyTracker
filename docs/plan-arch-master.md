# 🏛️ Project Architecture Master Document

## Overview
The ME Outreach Tracker v2 is a Next.js application designed to track company outreach and sponsorship progress using Google Sheets as a database.

## Architecture
- **Frontend**: Next.js (Pages Router)
- **Backend**: Next.js API Routes
- **Database**: Google Sheets (via Google Sheets API)
- **Authentication**: NextAuth.js with Google Provider

## File Structure
- `pages/api/`: Backend endpoints
- `lib/`: Shared utilities (Google Sheets client, cache, etc.)
- `components/`: UI components
- `docs/`: System documentation and plans

## 🗂️ Active Design Register
| Feature/Area | Current Version | Summary | Document Path |
|--------------|-----------------|---------|---------------|
| Google Auth | v1 | Service Account authentication for Sheets API. | docs/infrastructure/plan-google-auth-fix-v1.md |
| NextAuth Config | v1 | NextAuth configuration and session handling. | docs/infrastructure/plan-nextauth-secret-v1.md |
| Committee Workspace Status | v1 | Status list alignment. | docs/features/plan-committee-workspace-status-v1.md |
| Committee Compact Mode | v1 | Compact/normal toggle, tooltips, active contact. | docs/features/plan-committee-compact-mode-v1.md |
