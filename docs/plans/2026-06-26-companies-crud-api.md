# Companies External CRUD API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose Create, Read (single + list), and Update for companies via a versioned, API-key-authenticated REST interface at `/api/v1/companies`, usable by external tools and scripts.

**Architecture:** Extract shared business logic from `add-company.ts` and `update.ts` into `lib/companies.ts`. New v1 routes use that same lib, validated via API key rather than OAuth session. Existing web-app handlers become thin callers of the same lib functions — no behaviour change for the web app.

**Tech Stack:** Next.js 16 pages router, TypeScript, Google Sheets API (googleapis), LRU cache (`lib/cache.ts`), Node.js `crypto` module for timing-safe key comparison.

## Global Constraints

- All files live under `outreach-tracker/` — that is the Next.js app root
- No automated tests in this project — verify each task with curl commands against `npm run dev` (http://localhost:3000)
- `SPREADSHEET_ID_1` = company database sheet; `SPREADSHEET_ID_2` = outreach tracker sheet
- Column mappings for the tracker live in `lib/tracker-sheet-columns.ts` — do not hard-code column letters in new code; import from there
- Auth for existing routes must not change — only add new v1 routes and refactor internals
- `cache.delete('sheet_data')` is the correct cache invalidation call for updates; `cache.clear()` for creates

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `outreach-tracker/lib/api-key-auth.ts` | Create | `requireApiKey()` + `getApiActorLabel()` helpers |
| `outreach-tracker/lib/companies.ts` | Create | `createCompany`, `updateCompany`, `getCompany`, `listCompanies` |
| `outreach-tracker/pages/api/add-company.ts` | Modify | Delegate to `createCompany()` |
| `outreach-tracker/pages/api/update.ts` | Modify | Delegate to `updateCompany()` |
| `outreach-tracker/pages/api/v1/companies/index.ts` | Create | GET list, POST create |
| `outreach-tracker/pages/api/v1/companies/[id].ts` | Create | GET single, PUT update |

---

## Task 1: API Key Auth Helper

**Files:**
- Create: `outreach-tracker/lib/api-key-auth.ts`

**Interfaces:**
- Produces:
  - `requireApiKey(req: NextApiRequest, res: NextApiResponse): boolean` — sends error response and returns `false` on auth failure; returns `true` on success
  - `getApiActorLabel(req: NextApiRequest): string` — returns `"API:<first-8-chars-of-key>"` for audit logging

**Setup:**
- [ ] **Step 1: Add `COMPANIES_API_KEY` to your local env**

  In `outreach-tracker/.env.local` (create if it doesn't exist), add:
  ```
  COMPANIES_API_KEY=dev-test-key-do-not-use-in-production-00000000
  ```

- [ ] **Step 2: Create `lib/api-key-auth.ts`**

  ```typescript
  import type { NextApiRequest, NextApiResponse } from 'next';
  import crypto from 'crypto';

  export function requireApiKey(req: NextApiRequest, res: NextApiResponse): boolean {
      const configuredKey = process.env.COMPANIES_API_KEY;

      if (!configuredKey) {
          res.status(503).json({ error: 'API not configured', code: 'API_KEY_NOT_CONFIGURED' });
          return false;
      }

      const provided = req.headers['x-api-key'];
      if (!provided || typeof provided !== 'string') {
          res.status(401).json({ error: 'Missing API key', code: 'MISSING_API_KEY' });
          return false;
      }

      let valid = false;
      try {
          const a = Buffer.from(configuredKey);
          const b = Buffer.from(provided);
          valid = a.length === b.length && crypto.timingSafeEqual(a, b);
      } catch {
          valid = false;
      }

      if (!valid) {
          res.status(401).json({ error: 'Invalid API key', code: 'INVALID_API_KEY' });
          return false;
      }

      return true;
  }

  export function getApiActorLabel(req: NextApiRequest): string {
      const key = typeof req.headers['x-api-key'] === 'string' ? req.headers['x-api-key'] : '';
      return `API:${key.substring(0, 8)}`;
  }
  ```

- [ ] **Step 3: Verify with curl (dev server must be running: `npm run dev` in `outreach-tracker/`)**

  ```bash
  # Should return 401 MISSING_API_KEY (no key provided)
  curl -s http://localhost:3000/api/v1/companies | jq .
  # → {"error":"Missing API key","code":"MISSING_API_KEY"}

  # Should return 401 INVALID_API_KEY (wrong key)
  curl -s -H "X-API-Key: wrongkey" http://localhost:3000/api/v1/companies | jq .
  # → {"error":"Invalid API key","code":"INVALID_API_KEY"}
  ```

  (The v1 route doesn't exist yet — both will return 404 from Next.js at this point. That's expected. Come back to verify after Task 5.)

- [ ] **Step 4: Commit**

  ```bash
  git add outreach-tracker/lib/api-key-auth.ts
  git commit -m "feat: add API key auth helper for v1 companies endpoint"
  ```

---

## Task 2: Extract `createCompany` into `lib/companies.ts`

**Files:**
- Create: `outreach-tracker/lib/companies.ts`
- Modify: `outreach-tracker/pages/api/add-company.ts`

**Interfaces:**
- Produces:
  ```typescript
  interface CreateCompanyParams {
      companyName: string;
      discipline: string;
      contactName?: string;
      contactRole?: string;
      contactEmail?: string;
      contactPhone?: string;
      assignedTo?: string;
      remarks?: string;
      batchLabel?: string;
  }
  async function createCompany(params: CreateCompanyParams, actorLabel: string): Promise<{ companyId: string }>
  ```

- [ ] **Step 1: Create `lib/companies.ts` with `createCompany`**

  This is the logic currently in `pages/api/add-company.ts` lines 32–157, extracted verbatim but with `req.body` fields replaced by `params` and `actorLabel` replacing `formatActorLabel(ctx)`:

  ```typescript
  import { getGoogleSheetsClient } from './google-sheets';
  import { getCompanyDatabaseSheet } from './spreadsheet-utils';
  import { cache } from './cache';
  import { disciplineToDatabase } from './discipline-mapping';
  import { syncDailyStats } from './daily-stats';
  import { withSheetsRetry } from './sheets-retry';
  import { loadSheetData } from './sheet-data';
  import type { SheetCompany } from './sheet-data';
  import { TRACKER_FIELD_TO_COLUMN, TRACKER_ROW_INDEX } from './tracker-sheet-columns';
  import { extractPlainRejectionReason } from './rejection-reason';

  export interface CreateCompanyParams {
      companyName: string;
      discipline: string;
      contactName?: string;
      contactRole?: string;
      contactEmail?: string;
      contactPhone?: string;
      assignedTo?: string;
      remarks?: string;
      batchLabel?: string;
  }

  export async function createCompany(
      params: CreateCompanyParams,
      actorLabel: string,
  ): Promise<{ companyId: string }> {
      const {
          companyName,
          discipline,
          contactName,
          contactRole,
          contactEmail,
          contactPhone,
          assignedTo,
          remarks,
          batchLabel,
      } = params;

      const sheets = await getGoogleSheetsClient();
      const databaseSpreadsheetId = process.env.SPREADSHEET_ID_1;
      const trackerSpreadsheetId = process.env.SPREADSHEET_ID_2;

      if (!databaseSpreadsheetId || !trackerSpreadsheetId) {
          throw new Error('Spreadsheet IDs are not configured');
      }

      const dbMetadata = await sheets.spreadsheets.get({ spreadsheetId: databaseSpreadsheetId });
      const { title: dbSheetName } = getCompanyDatabaseSheet(dbMetadata.data.sheets);

      const dbResponse = await sheets.spreadsheets.values.get({
          spreadsheetId: databaseSpreadsheetId,
          range: `${dbSheetName}!A:A`,
      });
      const dbRows = dbResponse.data.values || [];

      const nextIdNumber = dbRows.length;
      const newCompanyId = `ME-${String(nextIdNumber).padStart(4, '0')}`;

      const trackerMetadata = await sheets.spreadsheets.get({ spreadsheetId: trackerSpreadsheetId });
      const trackerSheetName = trackerMetadata.data.sheets?.[0].properties?.title;
      if (!trackerSheetName) throw new Error('Outreach Tracker sheet not found');

      const disciplineAbbrev = disciplineToDatabase(discipline);
      const timestamp = new Date().toISOString();

      const databaseRow = [
          newCompanyId,
          companyName.trim(),
          disciplineAbbrev,
          '', '',
          contactName?.trim() || '',
          contactRole?.trim() || '',
          contactEmail?.trim() || '',
          contactPhone?.trim() || '',
          '', '', '', '',
          'TRUE',
          '', '', '', '',
          batchLabel?.trim() || '',
          timestamp,
      ];

      const trackerRow = [
          newCompanyId,
          companyName.trim(),
          'To Contact', '', '', '0', '',
          assignedTo || 'Unassigned',
          '', '', '0', '', '',
          remarks?.trim() || '',
          timestamp,
      ];

      await sheets.spreadsheets.values.append({
          spreadsheetId: databaseSpreadsheetId,
          range: `${dbSheetName}!A:T`,
          valueInputOption: 'RAW',
          requestBody: { values: [databaseRow] },
      });

      await sheets.spreadsheets.values.append({
          spreadsheetId: trackerSpreadsheetId,
          range: `${trackerSheetName}!A:K`,
          valueInputOption: 'RAW',
          requestBody: { values: [trackerRow] },
      });

      await sheets.spreadsheets.values.append({
          spreadsheetId: trackerSpreadsheetId,
          range: 'Thread_History!A:D',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[timestamp, newCompanyId, actorLabel, `Added new company ${companyName}`]] },
      });

      await sheets.spreadsheets.values.append({
          spreadsheetId: trackerSpreadsheetId,
          range: 'Logs_DoNotEdit!A:E',
          valueInputOption: 'RAW',
          requestBody: {
              values: [[timestamp, actorLabel, 'ADD_COMPANY', `${newCompanyId} – ${companyName}`, JSON.stringify({ discipline, assignedTo })]],
          },
      });

      cache.clear();
      await syncDailyStats(sheets, trackerSpreadsheetId);

      return { companyId: newCompanyId };
  }
  ```

- [ ] **Step 2: Refactor `pages/api/add-company.ts` to delegate to `createCompany`**

  Replace everything after the auth check and validation with a call to `createCompany`. The file becomes:

  ```typescript
  import type { NextApiRequest, NextApiResponse } from 'next';
  import { requireEffectiveCanEditCompanies, formatActorLabel } from '../../lib/authz';
  import { createCompany } from '../../lib/companies';

  export default async function handler(req: NextApiRequest, res: NextApiResponse) {
      if (req.method !== 'POST') {
          return res.status(405).json({ message: 'Method not allowed' });
      }

      const ctx = await requireEffectiveCanEditCompanies(req, res);
      if (!ctx) return;

      try {
          const { companyName, discipline, contactName, contactRole, contactEmail, contactPhone, assignedTo, remarks, batchLabel } = req.body;

          if (!companyName || !companyName.trim()) {
              return res.status(400).json({ message: 'Company name is required' });
          }
          if (!discipline) {
              return res.status(400).json({ message: 'Discipline is required' });
          }

          const actorLabel = formatActorLabel(ctx);
          const { companyId } = await createCompany(
              { companyName, discipline, contactName, contactRole, contactEmail, contactPhone, assignedTo, remarks, batchLabel },
              actorLabel,
          );

          return res.status(200).json({ message: 'Company added successfully', companyId });
      } catch (error) {
          console.error('API Error:', error);
          return res.status(500).json({ message: 'Internal Server Error' });
      }
  }
  ```

- [ ] **Step 3: Verify the web app add-company flow still works**

  Start `npm run dev`, open http://localhost:3000, click "Add Company", fill in the form, submit. Confirm the company appears in the list and both Google Sheets have a new row.

- [ ] **Step 4: Commit**

  ```bash
  git add outreach-tracker/lib/companies.ts outreach-tracker/pages/api/add-company.ts
  git commit -m "refactor: extract createCompany into lib/companies.ts"
  ```

---

## Task 3: Extract `updateCompany` into `lib/companies.ts`

**Files:**
- Modify: `outreach-tracker/lib/companies.ts`
- Modify: `outreach-tracker/pages/api/update.ts`

**Interfaces:**
- Consumes: `TRACKER_FIELD_TO_COLUMN`, `TRACKER_ROW_INDEX` from `lib/tracker-sheet-columns.ts`; `extractPlainRejectionReason` from `lib/rejection-reason.ts`
- Produces:
  ```typescript
  interface UpdateCompanyResult {
      verifiedData: {
          contactStatus: string;
          relationshipStatus: string;
          followUpsCompleted: number;
          lastContact: string;
          lastUpdated: string;
          remark: string;
          daysAttending: string;
      };
      historyLogged: boolean;
      updatedRows: number;
  }

  // Thrown when tracker row not found
  class CompanyNotFoundError extends Error { constructor(id: string) }

  // Thrown when rejection reason missing
  class RejectionReasonRequiredError extends Error {}

  // Thrown when tracker write succeeded but DB write failed
  class PartialWriteError extends Error {
      constructor(public readonly companyId: string, public readonly dbError: string)
  }

  async function updateCompany(
      companyId: string,
      updates: Record<string, unknown>,
      remark: string,
      actionDate: string | undefined,
      actorLabel: string,
  ): Promise<UpdateCompanyResult>
  ```

- [ ] **Step 1: Add error classes and `updateCompany` to `lib/companies.ts`**

  Append the following to `lib/companies.ts` (after `createCompany`). This is the logic from `pages/api/update.ts` lines 39–388, with `req.body` fields replaced by parameters, `formatActorLabel(ctx)` replaced by `actorLabel`, and early `res.status(...).json(...)` returns converted to thrown errors:

  ```typescript
  const UPDATE_READ_ATTEMPTS = 5;
  const UPDATE_READ_RETRY_OPTS = { baseDelayMs: 1500 } as const;

  export class CompanyNotFoundError extends Error {
      constructor(public readonly companyId: string) {
          super('COMPANY_NOT_FOUND');
          this.name = 'CompanyNotFoundError';
      }
  }

  export class RejectionReasonRequiredError extends Error {
      constructor() {
          super('REJECTION_REASON_REQUIRED');
          this.name = 'RejectionReasonRequiredError';
      }
  }

  export class PartialWriteError extends Error {
      constructor(
          public readonly companyId: string,
          public readonly dbError: string,
          public readonly partialLog: string,
      ) {
          super('PARTIAL_WRITE');
          this.name = 'PartialWriteError';
      }
  }

  export interface UpdateCompanyResult {
      verifiedData: {
          contactStatus: string;
          relationshipStatus: string;
          followUpsCompleted: number;
          lastContact: string;
          lastUpdated: string;
          remark: string;
          daysAttending: string;
      };
      historyLogged: boolean;
      updatedRows: number;
  }

  export async function updateCompany(
      companyId: string,
      updatesBody: Record<string, unknown>,
      remark: string,
      actionDate: string | undefined,
      actorLabel: string,
  ): Promise<UpdateCompanyResult> {
      const sheets = await getGoogleSheetsClient();
      const spreadsheetId1 = process.env.SPREADSHEET_ID_1;
      const spreadsheetId2 = process.env.SPREADSHEET_ID_2;

      if (!spreadsheetId1 || !spreadsheetId2) {
          throw new Error('Spreadsheet IDs are not configured');
      }

      const updates = { ...updatesBody };
      const timestamp = new Date().toISOString();
      const trackerUpdates: { range: string; values: unknown[][] }[] = [];
      const dbUpdates: { range: string; values: unknown[][] }[] = [];

      const trackerMeta = await withSheetsRetry(
          () => sheets.spreadsheets.get({ spreadsheetId: spreadsheetId2 }),
          UPDATE_READ_ATTEMPTS,
          'lib/companies:trackerMeta',
          UPDATE_READ_RETRY_OPTS,
      );
      const trackerSheetName = trackerMeta.data.sheets?.[0].properties?.title;

      const idRange = await withSheetsRetry(
          () => sheets.spreadsheets.values.get({ spreadsheetId: spreadsheetId2, range: `${trackerSheetName}!A:A` }),
          UPDATE_READ_ATTEMPTS,
          'lib/companies:idRange',
          UPDATE_READ_RETRY_OPTS,
      );

      const trackerRows = idRange.data.values || [];
      const trackerRowIndex = trackerRows.findIndex(row => row[0] === companyId) + 1;

      if (trackerRowIndex === 0) {
          throw new CompanyNotFoundError(companyId);
      }

      const currentSliceRange = await withSheetsRetry(
          () =>
              sheets.spreadsheets.values.get({
                  spreadsheetId: spreadsheetId2,
                  range: `${trackerSheetName}!${TRACKER_FIELD_TO_COLUMN.relationshipStatus}${trackerRowIndex}:${TRACKER_FIELD_TO_COLUMN.daysAttending}${trackerRowIndex}`,
              }),
          UPDATE_READ_ATTEMPTS,
          'lib/companies:currentSlice',
          UPDATE_READ_RETRY_OPTS,
      );
      const curSlice = currentSliceRange.data.values?.[0] || [];
      const currentRelationship = (curSlice[0] ?? '').toString().trim();
      const currentDaysAttending = (curSlice[TRACKER_ROW_INDEX.daysAttending - TRACKER_ROW_INDEX.relationshipStatus] ?? '').toString().trim();
      const currentSponsorshipTier = (curSlice[TRACKER_ROW_INDEX.sponsorshipTier - TRACKER_ROW_INDEX.relationshipStatus] ?? '').toString().trim();

      const requestedRelationship =
          updates.relationshipStatus !== undefined ? (updates.relationshipStatus ?? '').toString().trim() : undefined;
      const leavingRegistered =
          currentRelationship === 'Registered' &&
          requestedRelationship !== undefined &&
          requestedRelationship !== 'Registered';
      const rejectingCompany =
          requestedRelationship !== undefined && requestedRelationship === 'Rejected';
      const transitioningToRejected =
          rejectingCompany && currentRelationship !== 'Rejected';
      const clearingToNone =
          requestedRelationship !== undefined &&
          requestedRelationship === '' &&
          (currentRelationship === 'Registered' || currentRelationship === 'Interested');

      let autoDayClearNote = '';
      if (leavingRegistered) {
          updates.daysAttending = '';
          if (currentDaysAttending) {
              autoDayClearNote = `[Auto] Cleared Days attending (relationship no longer Registered). Previously: ${currentDaysAttending}`;
          }
      }

      let autoSponsorshipClearNote = '';
      if ((rejectingCompany || clearingToNone) && currentSponsorshipTier) {
          updates.sponsorshipTier = '';
          autoSponsorshipClearNote = `[Auto] Cleared Registered Sponsorship (relationship changed to None). Previously: ${currentSponsorshipTier}`;
      }

      let remarkText = typeof remark === 'string' ? remark : '';
      if (transitioningToRejected && !extractPlainRejectionReason(remarkText)) {
          throw new RejectionReasonRequiredError();
      }

      const TRACKER_MAP = TRACKER_FIELD_TO_COLUMN;

      trackerUpdates.push({
          range: `${trackerSheetName}!${TRACKER_MAP['lastUpdate']}${trackerRowIndex}`,
          values: [[timestamp]],
      });

      const keysToWrite = Object.keys(updates).filter(k => k !== 'previousResponse');
      keysToWrite.forEach(key => {
          const col = TRACKER_MAP[key];
          if (col) {
              trackerUpdates.push({
                  range: `${trackerSheetName}!${col}${trackerRowIndex}`,
                  values: [[(updates as Record<string, unknown>)[key]]],
              });
          }
      });

      if (autoDayClearNote) {
          remarkText = remarkText ? `${remarkText}\n\n${autoDayClearNote}` : autoDayClearNote;
      }
      if (autoSponsorshipClearNote) {
          remarkText = remarkText ? `${remarkText}\n\n${autoSponsorshipClearNote}` : autoSponsorshipClearNote;
      }

      if (!updates.contactStatus) {
          const currentDataRange = await withSheetsRetry(
              () => sheets.spreadsheets.values.get({
                  spreadsheetId: spreadsheetId2,
                  range: `${trackerSheetName}!G${trackerRowIndex}:K${trackerRowIndex}`,
              }),
              UPDATE_READ_ATTEMPTS,
              'lib/companies:currentData',
              UPDATE_READ_RETRY_OPTS,
          );
          const currentData = currentDataRange.data.values?.[0] || [];
          const lastCompanyContact = currentData[2];
          const lastContact = currentData[3];
          const currentFollowUps = parseInt(updates.followUpsCompleted?.toString() || currentData[4]) || 0;

          const tsCompany = lastCompanyContact ? new Date(lastCompanyContact).getTime() : 0;
          const tsCommittee = lastContact ? new Date(lastContact).getTime() : 0;
          const lastContactDate = Math.max(tsCompany, tsCommittee);

          if (currentFollowUps >= 3 && lastContactDate > 0) {
              const daysSinceResponse = (Date.now() - lastContactDate) / (1000 * 60 * 60 * 24);
              if (daysSinceResponse > 3) {
                  trackerUpdates.push({
                      range: `${trackerSheetName}!${TRACKER_MAP['contactStatus']}${trackerRowIndex}`,
                      values: [['No Reply']],
                  });
                  remarkText = remarkText || `[Auto] Marked as No Reply after 3 follow-ups with no response for ${Math.floor(daysSinceResponse)} days`;
              }
          }
      }

      if (remarkText) {
          trackerUpdates.push({
              range: `${trackerSheetName}!${TRACKER_MAP['remarks']}${trackerRowIndex}`,
              values: [[remarkText]],
          });
      }

      const DB_MAP: Record<string, string> = {
          companyName: 'B',
          discipline: 'C',
          targetSponsorshipTier: 'D',
      };
      const updateKeys = Object.keys(updates);
      const needsDatabaseSheet = updateKeys.some(k => k in DB_MAP);

      const dbRowIndices: number[] = [];
      if (needsDatabaseSheet) {
          const dbMeta = await withSheetsRetry(
              () => sheets.spreadsheets.get({ spreadsheetId: spreadsheetId1 }),
              UPDATE_READ_ATTEMPTS,
              'lib/companies:dbMeta',
              UPDATE_READ_RETRY_OPTS,
          );
          const { title: dbSheetName } = getCompanyDatabaseSheet(dbMeta.data.sheets);

          const dbIdRange = await withSheetsRetry(
              () => sheets.spreadsheets.values.get({ spreadsheetId: spreadsheetId1, range: `${dbSheetName}!A:A` }),
              UPDATE_READ_ATTEMPTS,
              'lib/companies:dbIdRange',
              UPDATE_READ_RETRY_OPTS,
          );

          const dbRows = dbIdRange.data.values || [];
          dbRows.forEach((row, index) => {
              if (row[0] === companyId) dbRowIndices.push(index + 1);
          });

          dbRowIndices.forEach(rowIndex => {
              Object.entries(updates).forEach(([key, value]) => {
                  if (DB_MAP[key]) {
                      dbUpdates.push({
                          range: `${dbSheetName}!${DB_MAP[key]}${rowIndex}`,
                          values: [[value]],
                      });
                  }
              });
          });
      }

      if (trackerUpdates.length > 0) {
          await sheets.spreadsheets.values.batchUpdate({
              spreadsheetId: spreadsheetId2,
              requestBody: { valueInputOption: 'USER_ENTERED', data: trackerUpdates },
          });
      }

      if (dbUpdates.length > 0) {
          try {
              await sheets.spreadsheets.values.batchUpdate({
                  spreadsheetId: spreadsheetId1,
                  requestBody: { valueInputOption: 'USER_ENTERED', data: dbUpdates },
              });
          } catch (dbErr) {
              const err = dbErr as Error;
              const logDetail = `Tracker updated but Database failed for company ${companyId}: ${err.message}`;
              try {
                  await sheets.spreadsheets.values.append({
                      spreadsheetId: spreadsheetId2,
                      range: 'Logs_DoNotEdit!A:E',
                      valueInputOption: 'RAW',
                      requestBody: {
                          values: [[
                              new Date().toISOString(),
                              actorLabel,
                              'PARTIAL_WRITE_ERROR',
                              logDetail,
                              JSON.stringify({ companyId, operation: 'COMPANY_UPDATE', payload: updates }),
                          ]],
                      },
                  });
              } catch { /* log failure is non-fatal */ }
              throw new PartialWriteError(companyId, err.message, logDetail);
          }
      }

      await sheets.spreadsheets.values.append({
          spreadsheetId: spreadsheetId2,
          range: 'Logs_DoNotEdit!A:E',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[timestamp, actorLabel, 'COMPANY_UPDATE', `${companyId} – ${updates.companyName || companyId}`, JSON.stringify(updates)]] },
      });

      const historyEntryText = remarkText || (trackerUpdates.length > 1 || dbUpdates.length > 0
          ? `[Update] ${Object.keys(updates).filter(k => updates[k] !== undefined && updates[k] !== '').join(', ')}`
          : '');

      let historyLogged = false;
      if (historyEntryText) {
          try {
              await sheets.spreadsheets.values.append({
                  spreadsheetId: spreadsheetId2,
                  range: 'Thread_History!A:D',
                  valueInputOption: 'USER_ENTERED',
                  insertDataOption: 'INSERT_ROWS',
                  requestBody: { values: [[actionDate || timestamp, companyId, actorLabel, historyEntryText]] },
              });
              historyLogged = true;
          } catch (historyErr) {
              const err = historyErr as Error;
              try {
                  await sheets.spreadsheets.values.append({
                      spreadsheetId: spreadsheetId2,
                      range: 'Logs_DoNotEdit!A:E',
                      valueInputOption: 'RAW',
                      requestBody: {
                          values: [[
                              new Date().toISOString(),
                              actorLabel,
                              'THREAD_HISTORY_WRITE_FAILED',
                              `Failed to append Thread_History for ${companyId}: ${err.message}`,
                              JSON.stringify({ companyId, historyEntryText, updates }),
                          ]],
                      },
                  });
              } catch { /* non-fatal */ }
          }
      }

      cache.delete('sheet_data');
      await syncDailyStats(sheets, spreadsheetId2);

      const verifyRange = await withSheetsRetry(
          () => sheets.spreadsheets.values.get({
              spreadsheetId: spreadsheetId2,
              range: `${trackerSheetName}!A${trackerRowIndex}:P${trackerRowIndex}`,
          }),
          UPDATE_READ_ATTEMPTS,
          'lib/companies:verify',
          UPDATE_READ_RETRY_OPTS,
      );
      const updatedRow = verifyRange.data.values?.[0] || [];

      return {
          verifiedData: {
              contactStatus: updatedRow[2] || '',
              relationshipStatus: updatedRow[3] || '',
              followUpsCompleted: parseInt(updatedRow[10]) || 0,
              lastContact: updatedRow[9] || '',
              lastUpdated: updatedRow[15] || '',
              remark: updatedRow[14] || '',
              daysAttending: updatedRow[13] || '',
          },
          historyLogged,
          updatedRows: dbRowIndices.length,
      };
  }
  ```

- [ ] **Step 2: Refactor `pages/api/update.ts` to delegate to `updateCompany`**

  Replace the entire handler body with:

  ```typescript
  import type { NextApiRequest, NextApiResponse } from 'next';
  import { requireEffectiveCanEditCompanies, formatActorLabel } from '../../lib/authz';
  import { updateCompany, CompanyNotFoundError, RejectionReasonRequiredError, PartialWriteError } from '../../lib/companies';
  import { isRetryableSheetsError } from '../../lib/sheets-retry';

  export default async function handler(req: NextApiRequest, res: NextApiResponse) {
      if (req.method !== 'POST') {
          return res.status(405).json({ message: 'Method not allowed' });
      }

      const ctx = await requireEffectiveCanEditCompanies(req, res);
      if (!ctx) return;

      const { companyId, updates: updatesBody, user, remark, actionDate } = req.body;

      if (!companyId || !user) {
          return res.status(400).json({ message: 'Missing required fields (companyId, user)' });
      }
      if (!updatesBody || typeof updatesBody !== 'object') {
          return res.status(400).json({ message: 'Missing or invalid updates' });
      }

      try {
          const actorLabel = formatActorLabel(ctx);
          const result = await updateCompany(
              companyId,
              updatesBody as Record<string, unknown>,
              typeof remark === 'string' ? remark : '',
              actionDate,
              actorLabel,
          );

          console.log('[api/update] verify_ok', {
              companyId,
              actor: actorLabel,
              historyLogged: result.historyLogged,
              contactStatus: result.verifiedData.contactStatus,
              followUpsCompleted: result.verifiedData.followUpsCompleted,
              lastUpdated: result.verifiedData.lastUpdated,
          });

          return res.status(200).json({
              success: true,
              updatedRows: result.updatedRows,
              verifiedData: result.verifiedData,
              historyLogged: result.historyLogged,
          });
      } catch (error) {
          if (error instanceof CompanyNotFoundError) {
              return res.status(404).json({ message: 'Company not found in Outreach Tracker' });
          }
          if (error instanceof RejectionReasonRequiredError) {
              return res.status(400).json({ message: 'Rejection reason is required when marking as Rejected.' });
          }
          if (error instanceof PartialWriteError) {
              return res.status(207).json({
                  success: false,
                  message: `Tracker was updated but Database sync failed. Data may be out of sync. Company: ${error.companyId}. Check Logs_DoNotEdit for details.`,
                  partialSuccess: { tracker: true, database: false },
              });
          }
          if (isRetryableSheetsError(error)) {
              return res.status(503).json({ message: 'Sheets quota exceeded — please retry in a moment', quota: true });
          }
          console.error('Update Error:', error);
          return res.status(500).json({ message: error instanceof Error ? error.message : 'Update Failed' });
      }
  }
  ```

- [ ] **Step 3: Verify the web app company update flow still works**

  Open http://localhost:3000, click a company, change its contact status, save. Confirm the change persists after a page refresh and appears in the company's thread history.

- [ ] **Step 4: Commit**

  ```bash
  git add outreach-tracker/lib/companies.ts outreach-tracker/pages/api/update.ts
  git commit -m "refactor: extract updateCompany into lib/companies.ts"
  ```

---

## Task 4: Add `getCompany` and `listCompanies` to `lib/companies.ts`

**Files:**
- Modify: `outreach-tracker/lib/companies.ts`

**Interfaces:**
- Consumes: `loadSheetData`, `SheetCompany` from `lib/sheet-data.ts` (already imported in Task 2)
- Produces:
  ```typescript
  async function listCompanies(options?: { includeArchived?: boolean }): Promise<SheetCompany[]>
  async function getCompany(companyId: string): Promise<SheetCompany | null>
  ```

- [ ] **Step 1: Append `listCompanies` and `getCompany` to `lib/companies.ts`**

  ```typescript
  export async function listCompanies(options?: { includeArchived?: boolean }): Promise<SheetCompany[]> {
      const result = await loadSheetData();
      if (!result.ok) throw new Error(result.message);
      const companies = result.payload.companies;
      if (options?.includeArchived) return companies;
      return companies.filter(c => !c.isDeleted);
  }

  export async function getCompany(companyId: string): Promise<SheetCompany | null> {
      const result = await loadSheetData();
      if (!result.ok) throw new Error(result.message);
      return result.payload.companies.find(c => c.id === companyId) ?? null;
  }
  ```

  Note: `SheetCompany.isDeleted` is set by `loadSheetData` based on the `Archived` column in the DB sheet. Companies with `Archived = "Y"` have `isDeleted: true`. `listCompanies` filters these out by default.

- [ ] **Step 2: Commit**

  ```bash
  git add outreach-tracker/lib/companies.ts
  git commit -m "feat: add getCompany and listCompanies to lib/companies.ts"
  ```

---

## Task 5: v1 List + Create Route

**Files:**
- Create: `outreach-tracker/pages/api/v1/companies/index.ts`

**Interfaces:**
- Consumes:
  - `requireApiKey(req, res): boolean` from `lib/api-key-auth.ts`
  - `getApiActorLabel(req): string` from `lib/api-key-auth.ts`
  - `createCompany(params: CreateCompanyParams, actorLabel: string): Promise<{ companyId: string }>` from `lib/companies.ts`
  - `listCompanies(options?: { includeArchived?: boolean }): Promise<SheetCompany[]>` from `lib/companies.ts`
  - `isRetryableSheetsError(err): boolean` from `lib/sheets-retry.ts`

- [ ] **Step 1: Create `pages/api/v1/companies/index.ts`**

  ```typescript
  import type { NextApiRequest, NextApiResponse } from 'next';
  import { requireApiKey, getApiActorLabel } from '../../../../lib/api-key-auth';
  import { createCompany, listCompanies } from '../../../../lib/companies';
  import { isRetryableSheetsError } from '../../../../lib/sheets-retry';

  export default async function handler(req: NextApiRequest, res: NextApiResponse) {
      if (!requireApiKey(req, res)) return;

      try {
          if (req.method === 'GET') {
              const includeArchived = req.query.includeArchived === 'true';
              const companies = await listCompanies({ includeArchived });
              return res.status(200).json({ companies });
          }

          if (req.method === 'POST') {
              const {
                  companyName,
                  discipline,
                  contactName,
                  contactRole,
                  contactEmail,
                  contactPhone,
                  assignedTo,
                  remarks,
                  batchLabel,
              } = req.body ?? {};

              if (!companyName?.trim()) {
                  return res.status(400).json({ error: 'Company name is required', code: 'MISSING_COMPANY_NAME' });
              }
              if (!discipline) {
                  return res.status(400).json({ error: 'Discipline is required', code: 'MISSING_DISCIPLINE' });
              }

              const actorLabel = getApiActorLabel(req);
              const { companyId } = await createCompany(
                  { companyName, discipline, contactName, contactRole, contactEmail, contactPhone, assignedTo, remarks, batchLabel },
                  actorLabel,
              );
              return res.status(201).json({ companyId });
          }

          return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
      } catch (error) {
          if (isRetryableSheetsError(error)) {
              return res.status(503).json({ error: 'Sheets quota exceeded — retry in a moment', code: 'SHEETS_QUOTA' });
          }
          console.error('[v1/companies]', error);
          return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
      }
  }
  ```

- [ ] **Step 2: Verify list endpoint**

  ```bash
  # Should return 401 — no key
  curl -s http://localhost:3000/api/v1/companies | jq .
  # → {"error":"Missing API key","code":"MISSING_API_KEY"}

  # Should return 401 — wrong key
  curl -s -H "X-API-Key: badkey" http://localhost:3000/api/v1/companies | jq .
  # → {"error":"Invalid API key","code":"INVALID_API_KEY"}

  # Should return 200 with companies array
  curl -s -H "X-API-Key: dev-test-key-do-not-use-in-production-00000000" \
    http://localhost:3000/api/v1/companies | jq '.companies | length'
  # → some positive number

  # Should include archived companies
  curl -s -H "X-API-Key: dev-test-key-do-not-use-in-production-00000000" \
    "http://localhost:3000/api/v1/companies?includeArchived=true" | jq '.companies | length'
  # → same or higher number
  ```

- [ ] **Step 3: Verify create endpoint**

  ```bash
  curl -s -X POST http://localhost:3000/api/v1/companies \
    -H "X-API-Key: dev-test-key-do-not-use-in-production-00000000" \
    -H "Content-Type: application/json" \
    -d '{"companyName":"API Test Co","discipline":"CS"}' | jq .
  # → {"companyId":"ME-XXXX"}

  # Missing required field should return 400
  curl -s -X POST http://localhost:3000/api/v1/companies \
    -H "X-API-Key: dev-test-key-do-not-use-in-production-00000000" \
    -H "Content-Type: application/json" \
    -d '{"companyName":"API Test Co"}' | jq .
  # → {"error":"Discipline is required","code":"MISSING_DISCIPLINE"}
  ```

  Confirm the created company appears in both Google Sheets and in the web app.

- [ ] **Step 4: Commit**

  ```bash
  git add outreach-tracker/pages/api/v1/companies/index.ts
  git commit -m "feat: add GET /api/v1/companies and POST /api/v1/companies"
  ```

---

## Task 6: v1 Get + Update Route

**Files:**
- Create: `outreach-tracker/pages/api/v1/companies/[id].ts`

**Interfaces:**
- Consumes:
  - `requireApiKey(req, res): boolean` from `lib/api-key-auth.ts`
  - `getApiActorLabel(req): string` from `lib/api-key-auth.ts`
  - `getCompany(companyId: string): Promise<SheetCompany | null>` from `lib/companies.ts`
  - `updateCompany(companyId, updates, remark, actionDate, actorLabel): Promise<UpdateCompanyResult>` from `lib/companies.ts`
  - `CompanyNotFoundError`, `RejectionReasonRequiredError`, `PartialWriteError` from `lib/companies.ts`
  - `isRetryableSheetsError(err): boolean` from `lib/sheets-retry.ts`

- [ ] **Step 1: Create `pages/api/v1/companies/[id].ts`**

  ```typescript
  import type { NextApiRequest, NextApiResponse } from 'next';
  import { requireApiKey, getApiActorLabel } from '../../../../lib/api-key-auth';
  import {
      getCompany,
      updateCompany,
      CompanyNotFoundError,
      RejectionReasonRequiredError,
      PartialWriteError,
  } from '../../../../lib/companies';
  import { isRetryableSheetsError } from '../../../../lib/sheets-retry';

  export default async function handler(req: NextApiRequest, res: NextApiResponse) {
      if (!requireApiKey(req, res)) return;

      const { id } = req.query;
      if (typeof id !== 'string' || !/^ME-\d{4}$/.test(id)) {
          return res.status(400).json({ error: 'Invalid company ID format. Expected ME-XXXX', code: 'INVALID_ID' });
      }

      try {
          if (req.method === 'GET') {
              const company = await getCompany(id);
              if (!company) {
                  return res.status(404).json({ error: `Company ${id} not found`, code: 'NOT_FOUND' });
              }
              return res.status(200).json({ company });
          }

          if (req.method === 'PUT') {
              const { updates, remark, actionDate } = req.body ?? {};

              if (!updates || typeof updates !== 'object') {
                  return res.status(400).json({ error: 'Missing or invalid updates object', code: 'INVALID_UPDATES' });
              }

              const actorLabel = getApiActorLabel(req);
              const result = await updateCompany(
                  id,
                  updates as Record<string, unknown>,
                  typeof remark === 'string' ? remark : '',
                  actionDate,
                  actorLabel,
              );
              return res.status(200).json({ success: true, verifiedData: result.verifiedData });
          }

          return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
      } catch (error) {
          if (error instanceof CompanyNotFoundError) {
              return res.status(404).json({ error: `Company ${id} not found`, code: 'NOT_FOUND' });
          }
          if (error instanceof RejectionReasonRequiredError) {
              return res.status(400).json({ error: 'Rejection reason is required when marking as Rejected', code: 'REJECTION_REASON_REQUIRED' });
          }
          if (error instanceof PartialWriteError) {
              return res.status(207).json({
                  success: false,
                  error: `Tracker updated but Database sync failed for company ${id}. Check Logs_DoNotEdit.`,
                  code: 'PARTIAL_WRITE',
                  partialSuccess: { tracker: true, database: false },
              });
          }
          if (isRetryableSheetsError(error)) {
              return res.status(503).json({ error: 'Sheets quota exceeded — retry in a moment', code: 'SHEETS_QUOTA' });
          }
          console.error(`[v1/companies/${id}]`, error);
          return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
      }
  }
  ```

- [ ] **Step 2: Verify get single company**

  ```bash
  # Replace ME-0001 with a real ID from your sheet
  curl -s -H "X-API-Key: dev-test-key-do-not-use-in-production-00000000" \
    http://localhost:3000/api/v1/companies/ME-0001 | jq .company.companyName
  # → "Actual Company Name"

  # Non-existent ID
  curl -s -H "X-API-Key: dev-test-key-do-not-use-in-production-00000000" \
    http://localhost:3000/api/v1/companies/ME-9999 | jq .
  # → {"error":"Company ME-9999 not found","code":"NOT_FOUND"}

  # Bad format
  curl -s -H "X-API-Key: dev-test-key-do-not-use-in-production-00000000" \
    http://localhost:3000/api/v1/companies/notanid | jq .
  # → {"error":"Invalid company ID format. Expected ME-XXXX","code":"INVALID_ID"}
  ```

- [ ] **Step 3: Verify update endpoint**

  ```bash
  # Replace ME-XXXX with the ID of the test company created in Task 5
  curl -s -X PUT http://localhost:3000/api/v1/companies/ME-XXXX \
    -H "X-API-Key: dev-test-key-do-not-use-in-production-00000000" \
    -H "Content-Type: application/json" \
    -d '{"updates":{"assignedPic":"Test User"},"remark":"Updated via API"}' | jq .
  # → {"success":true,"verifiedData":{...}}

  # Confirm in web app that the change is visible and the thread history shows
  # "Updated via API" with actor "API:dev-test"

  # Missing updates object
  curl -s -X PUT http://localhost:3000/api/v1/companies/ME-XXXX \
    -H "X-API-Key: dev-test-key-do-not-use-in-production-00000000" \
    -H "Content-Type: application/json" \
    -d '{}' | jq .
  # → {"error":"Missing or invalid updates object","code":"INVALID_UPDATES"}
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add outreach-tracker/pages/api/v1/companies/[id].ts
  git commit -m "feat: add GET /api/v1/companies/[id] and PUT /api/v1/companies/[id]"
  ```

---

## Production Setup

Before deploying, add `COMPANIES_API_KEY` to Cloud Run:

```bash
# Generate a secure key
openssl rand -hex 32

# Add to Cloud Run (in deploy.sh or via gcloud CLI)
--set-env-vars COMPANIES_API_KEY=<generated-value>
```

The deploy.sh script already handles other env vars — add `COMPANIES_API_KEY` the same way.
