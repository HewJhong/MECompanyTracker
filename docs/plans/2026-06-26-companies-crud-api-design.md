# Companies External CRUD API — Design Spec

**Date:** 2026-06-26  
**Status:** Approved

## Overview

Add a versioned, API-key-authenticated REST interface at `/api/v1/companies` that exposes Create, Read (single + list), and Update operations on companies. The API is intended for external tools and scripts. Delete is intentionally excluded. All business rules, validation, and audit logging match the web app exactly.

## API Surface

| Method | Route | Action |
|--------|-------|--------|
| `GET` | `/api/v1/companies` | List all active companies |
| `POST` | `/api/v1/companies` | Create a new company |
| `GET` | `/api/v1/companies/[id]` | Fetch a single company by `ME-XXXX` ID |
| `PUT` | `/api/v1/companies/[id]` | Update a company |

### Request / Response Contracts

**List (`GET /api/v1/companies`)**
- Query param: `includeArchived=true` to include soft-deleted companies (default: false)
- Response: `{ companies: Company[] }`

**Create (`POST /api/v1/companies`)**
- Body fields (mirrors `add-company`): `companyName` (required), `discipline` (required), `contactName`, `contactRole`, `contactEmail`, `contactPhone`, `assignedTo`, `remarks`, `batchLabel`
- Response: `{ companyId: "ME-XXXX" }`

**Get (`GET /api/v1/companies/[id]`)**
- Response: `{ company: Company }`

**Update (`PUT /api/v1/companies/[id]`)**
- Body fields (mirrors `update`): `updates` object (tracker fields), `remark`, `actionDate`
- Response: `{ success: true, verifiedData: { ... } }`

### Error Shape

All errors return:
```json
{ "error": "Human-readable description", "code": "OPTIONAL_MACHINE_CODE" }
```

HTTP status conventions: `400` validation, `401` bad/missing API key, `404` company not found, `503` Sheets quota, `500` unexpected.

## Authentication

A new env var `COMPANIES_API_KEY` holds a long random secret (minimum 32 characters). All v1 requests must include:

```
X-API-Key: <secret>
```

A helper `lib/api-key-auth.ts` exports `requireApiKey(req, res): boolean` using `crypto.timingSafeEqual` for constant-time comparison to prevent timing attacks. Missing or wrong key → `401`. If `COMPANIES_API_KEY` is not set in the environment, all v1 requests return `503` with `{ "error": "API not configured", "code": "API_KEY_NOT_CONFIGURED" }` — this prevents accidental open access in misconfigured environments. The actor label written to audit sheets is `API:<first-8-chars-of-key>` to distinguish API writes from web app user writes.

Existing session-authenticated endpoints are unchanged — the two auth paths are entirely separate.

## Shared Business Logic Layer (`lib/companies.ts`)

Business logic is extracted from the existing handlers into four functions:

```ts
createCompany(params: CreateCompanyParams, actorLabel: string): Promise<{ companyId: string }>
updateCompany(companyId: string, updates: Record<string, unknown>, remark: string, actionDate: string | undefined, actorLabel: string): Promise<{ verifiedData: VerifiedData }>
getCompany(companyId: string): Promise<Company | null>
listCompanies(options?: { includeArchived?: boolean }): Promise<Company[]>
```

Each function is responsible for the full side-effect chain:
- Dual-sheet read/write (SPREADSHEET_ID_1 database + SPREADSHEET_ID_2 tracker)
- All business rules: rejection reason validation, auto-clear `daysAttending` on leaving Registered, auto-clear `sponsorshipTier` on rejecting/clearing, auto No Reply transition after 3 follow-ups
- Audit logging to `Thread_History` and `Logs_DoNotEdit`
- LRU cache invalidation (`cache.delete('sheet_data')`)
- `syncDailyStats` after writes

`getCompany` and `listCompanies` are net-new reads. `listCompanies` wraps the existing `loadSheetData` from `lib/sheet-data.ts`. `getCompany` reads a single tracker row + matching DB rows by ID.

### Existing Handler Refactor

`pages/api/add-company.ts` and `pages/api/update.ts` become thin callers of `createCompany` and `updateCompany`. They extract auth context + request fields, call the lib function with `formatActorLabel(ctx)` as the actor, and return JSON. Behaviour is identical to today.

## File Changes

### New files
- `lib/api-key-auth.ts` — `requireApiKey` helper
- `lib/companies.ts` — shared business logic functions
- `pages/api/v1/companies/index.ts` — GET list, POST create
- `pages/api/v1/companies/[id].ts` — GET single, PUT update

### Modified files
- `pages/api/add-company.ts` — delegate to `createCompany()`
- `pages/api/update.ts` — delegate to `updateCompany()`
- `.env.example` — add `COMPANIES_API_KEY` entry

### Unchanged
- All other existing endpoints (`delete-company`, `restore-company`, `companies/insert`, etc.)
- Auth, caching, and retry infrastructure

## Environment

Add to `.env.local` and Cloud Run:
```
COMPANIES_API_KEY=<generate with: openssl rand -hex 32>
```

## Out of Scope

- Delete / restore via external API
- Pagination on the list endpoint (deferred; company count is manageable for now)
- Rate limiting (deferred; API key is pre-shared with trusted callers)
- Contact CRUD via this API
