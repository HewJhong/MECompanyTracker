# Committee workspace batch update plan

## Stakeholder decisions (locked)

| Topic | Decision |
|-------|----------|
| **Scope v1** | **Log outreach only** (most used). Other bulk actions (follow-up, company reply, our reply) stay on per-company `/api/update` until a later phase. |
| **Logging** | **One row per company** in both **`Logs_DoNotEdit`** and **`Thread_History`**. Wording must match **company details page** first-outreach logging (see Parity below). |
| **Success / failure** | **All-or-nothing** for the batch: either every selected company is updated consistently, or the operation fails without applying a partial set. **Implement retries** (transient errors, quota) — see Retry strategy. |

---

## Feature/Task Overview

Replace committee **Log outreach** (bulk) from many parallel `POST /api/update` calls with **one dedicated batch API** per user action, following the same architectural idea as **All Companies** (`bulk-assign`, `bulk-update-status`): minimal redundant Google Sheets reads, one primary `values.batchUpdate` for tracker cells, then batched logging.

**Purpose:** Reduce Sheets API quota usage, improve reliability, and align audit/history lines with the company detail flow.

**Out of scope for v1:** Batch endpoints for follow-up, company reply, and our reply.

---

## Parity: company details “first outreach” format

Implementers must align **remark text** and **Thread_History / Logs** content with how **first outreach** is expressed on the company detail page when the user saves after logging outreach.

On company details, first outreach uses a remark prefix **`[Outreach #0]`** (not `[Outreach]` alone and not the committee-only default `Bulk: Sent first outreach`). Optional user text is appended per the same rules as the detail page: default suffix behavior matches **“Logged”** when there is no extra remark.

**Requirement:** Bulk log outreach from committee workspace must produce **the same remark string per company** that a user would get from logging first outreach on that company’s detail page for the same optional note and action date — so history and exports stay consistent.

*Reference implementation to mirror (behavior, not code in this doc):* `handleLogOutreach` and the save path in `pages/companies/[id].tsx` for `contactStatus === 'To Contact'` / first outreach.

---

## Flow Visualization

```mermaid
sequenceDiagram
    participant UI as CommitteeWorkspace
    participant API as Batch log outreach API
    participant Sheets as Google Sheets

    UI->>API: POST once (companyIds + user + remark + actionDate)
    API->>API: Auth requireEffectiveCanEditCompanies
    API->>Sheets: Read tracker metadata + column A once
    API->>Sheets: Validate all IDs resolve to rows; reject if any missing
    API->>Sheets: One values.batchUpdate all tracker cells
    API->>Sheets: Append Logs_DoNotEdit one row per company
    API->>Sheets: Append Thread_History one row per company
    API->>API: syncDailyStats once, cache delete once
    API-->>UI: 200 or error (no partial apply)
    UI->>UI: Debounced refresh
```

```mermaid
flowchart LR
    subgraph today
        C1[Company 1]
        C2[Company 2]
        CN[Company N]
        C1 --> U1[/api/update]
        C2 --> U2[/api/update]
        CN --> UN[/api/update]
    end
    subgraph target
        S[Selected To Contact]
        B[POST batch log outreach]
        S --> B
    end
```

---

## Retry strategy (requirements)

- **Client and/or server:** On transient failures (network, 429, 503, quota messages, configurable list), **retry the same logical operation** with **exponential backoff** and a **maximum attempt count**.
- **All-or-nothing:** Retries must re-attempt the **full** batch operation for that user action — not “continue where we left off” in a way that could double-apply half the companies. If the server completes tracker writes but a later step fails, the implementation must define recovery (e.g. retry only failed append steps if idempotent, or fail closed and instruct user to refresh — document chosen behavior in implementation notes).
- **Idempotency:** Consider whether duplicate retries could duplicate `Logs_DoNotEdit` / `Thread_History` rows; mitigate with a single server-side transaction pattern or explicit idempotency keys if needed.

---

## Relevant Files

| Area | Files | Role |
|------|--------|------|
| Client bulk (v1) | `components/committee-workspace.tsx` | Replace parallel `/api/update` for **Log outreach** with one batch call + retries |
| Single-company reference | `pages/api/update.ts` | Tracker column map, remarks column, `Thread_History` / `Logs_DoNotEdit` behavior to mirror |
| Company detail parity | `pages/companies/[id].tsx` | **Source of truth** for first-outreach remark format (`[Outreach #0]`, etc.) |
| Reference batch patterns | `pages/api/bulk-assign.ts`, `pages/api/bulk-update-status.ts` | Batch `values.batchUpdate`, multi-row append patterns |
| Auth | `lib/authz.ts` | `requireEffectiveCanEditCompanies`, impersonation edits flag |
| Daily stats / cache | `lib/daily-stats.ts`, `lib/cache.ts` | Once per batch |

**Implemented v1:** `pages/api/committee-bulk-log-outreach.ts` — batch route for log outreach only.

---

## References and Resources

- Google Sheets API: `spreadsheets.values.batchUpdate` — multiple ranges in one request.
- Internal: `docs/CURRENT_USER_AND_AUTH.md`.

---

## Task Breakdown

### Phase 1 — API contract and validation rules

#### Description
Define request body (e.g. `companyIds`, `user`, optional remark text, `actionDate`), validation (all IDs must be **To Contact** on server or trust client with server re-check from sheet), and response (200 with count, or error with no partial state). Document all-or-nothing and retry expectations for the client.

#### Relevant files
New API route file, short note in plan or README for consumers

#### Sub-tasks
- [ ] Require server-side validation that each row’s contact status allows first outreach (align with committee selection rules).
- [ ] Specify exact remark string rules matching company details `[Outreach #0]` behavior.
- [ ] Define error codes/messages for “not all IDs found” vs “quota” vs “permission”.

**Dependencies:** None.

---

### Phase 2 — Server: batch log outreach

#### Description
Implement the new route with `requireEffectiveCanEditCompanies`. Read tracker once (metadata + `A:A` or equivalent) to resolve all row numbers. Build **one** `batchUpdate` for all tracker fields per company (contact status, follow-ups, last committee contact, last update timestamp, remarks column as needed — match `/api/update` semantics for this action). Then **one append per log stream** with **N rows** (one per company) for `Logs_DoNotEdit` and `Thread_History`, using the **same** per-company text that `/api/update` would produce for equivalent input. Call `syncDailyStats` once; `cache.delete('sheet_data')` once. Skip spreadsheet 1 reads when no DB-mapped keys (same as optimized `update.ts`).

#### Relevant files
New batch API, `pages/api/update.ts` (reference or small shared helper extraction)

#### Sub-tasks
- [ ] Do not apply tracker updates if any `companyId` is missing from the sheet (fail entire request).
- [ ] Reuse `formatActorLabel` for history actor column.
- [ ] Ensure Thread_History row shape matches existing columns (timestamp, companyId, actor, text).
- [ ] Implement server-side retry for transient Google errors where safe (or return retryable flag for client).

**Dependencies:** Phase 1.

---

### Phase 3 — Client: committee workspace

#### Description
For **Log outreach** only: call the new endpoint once with selected companies (To Contact subset). Remove parallel `executeBulkUpdates` usage for this path. Implement **client retry** with backoff for failed requests. Keep background tasks, `onRefresh` debounce, impersonation / `canEditCompanies` gating. Leave other three bulk actions unchanged (still `/api/update` per company until phase 4).

#### Relevant files
`components/committee-workspace.tsx`

#### Sub-tasks
- [ ] Single `fetch` for log outreach bulk.
- [ ] Retry helper shared or inline (max attempts, backoff, only on retryable errors).
- [ ] User-facing message on total failure after retries.

**Dependencies:** Phase 2.

---

### Phase 4 — Future (not v1)

#### Description
Optionally extend the same batch pattern to follow-up, company reply, and our reply; extract shared batch utilities; document quota gains.

#### Sub-tasks
- [ ] TBD after v1 validation.

**Dependencies:** Phase 3 stable in production.

---

## Dependencies (between phases)

- Phase 2 depends on Phase 1.
- Phase 3 depends on Phase 2.
- Phase 4 is optional and separate.

---

## Potential Risks / Edge Cases

- **Non-transactional Sheets:** True cross-operation atomicity is limited; “all-or-nothing” is best-effort: prefer a **single** `batchUpdate` for all company rows so tracker state does not half-update; order appends after successful batch update and handle append failures with retry policy.
- **Duplicate rows on retry:** Retrying after a successful write may duplicate log rows unless retries are only before success response or idempotency is handled.
- **Large selections:** Timeouts — consider a documented max batch size.
- **Remark parity:** Any drift from `[Outreach #0]` rules breaks user trust; add a checklist comparing one bulk row to one detail-page row.

---

## Testing Checklist

### Log outreach (v1)

#### Selection and happy path
- [ ] Select multiple **To Contact** companies; **Log outreach** completes without per-company API storm.
- [ ] Tracker shows **Contacted**, **last committee contact**, and remark column consistent with detail page for the same optional note.
- [ ] **Thread_History** has **one row per company**; text matches company details first-outreach format.
- [ ] **Logs_DoNotEdit** has **one row per company** (or equivalent audit granularity agreed in implementation).

#### All-or-nothing
- [ ] If one `companyId` is invalid or not **To Contact**, **no** company from that request shows updated tracker state (verify with refresh).

#### Retry
- [ ] Simulate transient failure: user sees retry behavior and eventual success or clear final error without silent partial apply.

#### Auth
- [ ] Committee member with edit: works.
- [ ] View-only / impersonation when edits disabled: 403, no optimistic success.

### Regression
- [ ] Company **detail** page first outreach save unchanged.
- [ ] Other committee bulk actions (follow-up, replies) still work via `/api/update`.

---

## Notes

- Committee bulk log outreach now uses **`[Outreach #0]`** via the batch API (see Implementation notes).
- After v1, compare Sheets read/write counts against pre-batch metrics to confirm quota improvement.

---

## Implementation notes (2026-04-12)

### What shipped

- **`pages/api/committee-bulk-log-outreach.ts`:** `POST` body: `companyIds` (unique, max 200), `user`, optional `remark` (optional note only; server builds `[Outreach #0] Logged` or `[Outreach #0] ${remark}`), optional `actionDate` (ISO-parsable; drives `lastContact` and Thread_History timestamp column).
- **Validation:** Single read `A2:C`; each ID must exist and column C must be exactly `To Contact`. Any failure returns **400** with `message` + `errors[]` — **no** tracker writes.
- **Writes:** One `values.batchUpdate` for all rows (P, C, K, J, O per company); then one multi-row append to `Logs_DoNotEdit` and one to `Thread_History` (one row per company). `Logs_DoNotEdit` payload column mirrors `/api/update` (`COMPANY_UPDATE`, JSON of `{ contactStatus, followUpsCompleted, lastContact }`).
- **Post-write:** `cache.delete('sheet_data')`, `syncDailyStats` once. No per-row verify read (quota).
- **Retries:** Server wraps Sheets calls in `withSheetsRetry` (4 attempts, backoff) on quota / rate / transient patterns. Client `postCommitteeBulkLogOutreach` retries the **full** request on network errors and 5xx; **400/403** do not retry.
- **`components/committee-workspace.tsx`:** “Log outreach” uses the batch endpoint only; follow-up / company reply / our reply still use `executeBulkUpdates` + `/api/update`.

### Limitations / follow-ups

- **Not atomic across steps:** If `batchUpdate` succeeds and both appends fail after retries, the handler returns 500 with tracker already updated; user may need to refresh. Duplicate log rows are still possible if a client retries after a successful **200** (same as any non-idempotent POST).
- **Phase 2:** Optional batch routes for follow-up, company reply, and our reply remain future work.
