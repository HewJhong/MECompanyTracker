# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Outreach Tracker** is a Next.js web application for managing company outreach efforts and contact tracking. The app integrates with Google Sheets as the primary data store and Google OAuth for authentication. It's deployed on Google Cloud Run.

## Technology Stack

- **Framework**: Next.js 16.1.6 (pages router, not app router)
- **Language**: TypeScript
- **UI**: React 19, Tailwind CSS 4, Headless UI
- **Data**: Google Sheets API (googleapis), LRU cache for local caching
- **Auth**: NextAuth 4.24.13 with Google OAuth
- **State Management**: React Context (BackgroundTasksContext, CurrentUserContext)
- **DnD**: @dnd-kit for drag-and-drop functionality
- **Linting**: ESLint

## Development Commands

```bash
npm run dev          # Start dev server (http://localhost:3000)
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
```

## Project Structure

```
outreach-tracker/
├── pages/
│   ├── api/                    # API routes for backend logic
│   │   ├── data.ts            # Core data endpoints
│   │   ├── add-company.ts      # Company CRUD operations
│   │   ├── add-contact.ts      # Contact management
│   │   ├── bulk-assign.ts      # Bulk operations
│   │   ├── email-schedule/     # Email scheduling features
│   │   └── auth/               # NextAuth routes
│   ├── _app.tsx               # Next.js app wrapper
│   ├── index.tsx              # Dashboard page
│   ├── committee.tsx          # Committee workspace (Kanban-style)
│   ├── companies.tsx          # All companies table
│   ├── email-schedule.tsx      # Email schedule management
│   ├── analytics.tsx          # Analytics dashboard
│   └── settings.tsx           # Settings page
├── components/                 # Reusable React components
│   ├── Layout.tsx             # Main layout wrapper
│   ├── AllCompaniesTable.tsx   # Companies table (large component)
│   ├── committee-workspace.tsx # Kanban workspace
│   ├── AddCompanyModal.tsx     # Add company form
│   └── [other UI components]
├── lib/                        # Utility functions
│   ├── google-sheets.ts        # Google Sheets client setup
│   ├── auth.ts                 # Authentication utilities
│   ├── cache.ts                # Caching utilities
│   ├── email-schedule.ts       # Email scheduling logic
│   └── [other utilities]
├── contexts/                   # React Context providers
│   ├── BackgroundTasksContext.tsx  # Async task tracking
│   └── CurrentUserContext.tsx      # User info
├── styles/                     # Global styles
├── .env.example                # Environment variable template
├── next.config.ts              # Next.js configuration
└── deploy.sh                   # Cloud Run deployment script
```

## Architecture Notes

### Data Flow

1. **Source of Truth**: Google Sheets spreadsheets (SPREADSHEET_ID_1, SPREADSHEET_ID_2)
2. **API Layer** (pages/api/): Reads/writes to Google Sheets via googleapis
3. **Frontend**: React components fetch from API endpoints
4. **Caching**: LRU cache on backend (lib/cache.ts) to reduce API calls
5. **State**: React Context for UI state (background tasks, current user)

### Key Patterns

- **Background Tasks**: Use `BackgroundTasksContext` for async operations (see BackgroundTaskIndicator.tsx)
- **Google Sheets Integration**: Wrapper functions in lib/google-sheets.ts, with retry logic in sheets-retry.ts
- **Spreadsheet Columns**: Column mappings defined in lib/tracker-sheet-columns.ts (critical for data reads/writes)
- **Authorization**: lib/authz.ts handles role-based access control (e.g., admin-only operations)
- **Caching**: Local LRU cache with TTL to avoid hammering the Sheets API

### Large Components

- **AllCompaniesTable.tsx** (~75KB): Main companies table with sorting, filtering, searching, inline editing
- **committee-workspace.tsx** (~57KB): Kanban board with drag-and-drop for status workflow
- **email-schedule.tsx** (pages): Complex email scheduling UI with bulk operations

## Environment Setup

Create `.env.local` (copy from `.env.example`):

```
# NextAuth (Google sign-in)
NEXTAUTH_SECRET=[random string]
NEXTAUTH_URL=http://localhost:3000
GOOGLE_OAUTH_CLIENT_ID=[from Google Cloud Console]
GOOGLE_OAUTH_CLIENT_SECRET=[from Google Cloud Console]

# Google Sheets (service account)
GOOGLE_SERVICE_ACCOUNT_EMAIL=[service account email]
GOOGLE_PRIVATE_KEY=[service account private key, escaped newlines as \\n]

# Spreadsheets
SPREADSHEET_ID_1=[primary tracking sheet ID]
SPREADSHEET_ID_2=[secondary sheet ID if needed]
```

Service account credentials are obtained from a Google Cloud project with Sheets API enabled.

## Google Sheets Integration

The app treats Google Sheets as a database. Key files:

- **lib/google-sheets.ts**: Creates and returns authenticated Sheets client
- **lib/tracker-sheet-columns.ts**: Defines which columns map to which data fields
- **lib/sheets-retry.ts**: Retry logic for transient API failures
- **pages/api/data.ts**: Main endpoint for reading/writing company data

**Important**: When adding new columns or changing data schema, update the column mappings in tracker-sheet-columns.ts.

## Common Development Tasks

### Adding a New API Endpoint

1. Create file in `pages/api/` (e.g., `pages/api/new-feature.ts`)
2. Use `getGoogleSheetsClient()` from lib/google-sheets.ts
3. Implement CORS and auth checks (see existing endpoints)
4. Return JSON response

### Adding a New Page

1. Create file in `pages/` (e.g., `pages/new-page.tsx`)
2. Wrap content in `<Layout>` component from components/Layout.tsx
3. Fetch data from API endpoints using fetch or a custom hook
4. Use Tailwind classes for styling

### Modifying Company or Contact Data Schema

1. Update column mappings in lib/tracker-sheet-columns.ts
2. Update API endpoints that read/write that column
3. Update UI components that display/edit that field
4. Test with live Google Sheet to ensure data integrity

## Deployment

Cloud Run deployment via `deploy.sh` script:

```bash
# From project root
./deploy.sh
```

Environment variables are set on Cloud Run (NEXTAUTH_SECRET, GOOGLE_* variables). See docs/deployment/ for detailed guides.

## Code Quality

- **Linting**: ESLint config in eslint.config.mjs
- **TypeScript**: Strict mode enabled
- **No tests**: This project doesn't have automated tests; verify changes manually in the browser

## Debugging Tips

- **Google Sheets API errors**: Check .env.local credentials and Sheet permissions
- **Auth issues**: Verify NEXTAUTH_SECRET and GOOGLE_OAUTH_* in .env.local
- **Data not loading**: Check browser network tab and API response; verify column mappings in tracker-sheet-columns.ts
- **Background tasks not showing**: Check BackgroundTasksContext provider is wrapping the component
- **Drag-and-drop not working**: Verify @dnd-kit modules are imported correctly

## Performance Notes

- Large tables (AllCompaniesTable) render many rows; consider virtualization if adding thousands of companies
- Google Sheets API has rate limits; caching is essential for acceptable performance
- LRU cache TTL configured to balance freshness vs. API quota usage
