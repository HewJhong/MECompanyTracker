# Issue Card: Batch Write Reliability Across Committee Workspace and Email Scheduling

## Summary

Two operational flows currently perform a primary Google Sheets write first and then write audit/history entries in separate follow-up calls:

1. `Committee Workspace` bulk **Log outreach**
2. `Email Scheduling` create / update / delete actions

This leaves both flows vulnerable to partial success:

- the main sheet update can succeed
- `Logs_DoNotEdit` and/or `Thread_History` can fail afterward
- retries can create duplicate log/history rows if the original request already succeeded

The issue is to make these flows more reliable, easier to reason about, and safer under retries, transient Google Sheets failures, and Cloud Run request ambiguity.

---

## Problem Statement

The app has already reduced per-company API storms in committee bulk log outreach by introducing `pages/api/committee-bulk-log-outreach.ts`, but the write path is still not fully consistent. The same structural problem also exists in the email scheduling API.

Current pattern in both areas:

- perform the operational write first
- append to `Logs_DoNotEdit` afterward
- append to `Thread_History` afterward
- return success or failure based on the later steps

This creates two practical risks:

1. **Partial write state**
   - tracker or schedule data changes are visible in Sheets
   - audit/history rows are missing
   - user sees an error and may retry even though some work already happened

2. **Duplicate audit/history state**
   - client retry, user double-submit, or ambiguous network failure can replay the same logical action
   - log/history rows may be duplicated even when the business action should be treated as already completed

---

## Why This Matters

- **Operational trust:** Users need the audit trail and timeline to match what actually happened.
- **Support/debugging:** Missing or duplicated rows in `Logs_DoNotEdit` / `Thread_History` make incidents harder to reconstruct.
- **Cloud Run behavior:** Request retries and uncertain client outcomes are normal enough that non-idempotent writes are risky.
- **Shared architecture:** Committee workspace and email scheduling now have the same class of reliability issue, so solving only one path leaves a similar failure mode elsewhere.

---

## In Scope

### Committee workspace

- Bulk **Log outreach** in `components/committee-workspace.tsx`
- Server route `pages/api/committee-bulk-log-outreach.ts`
- Reliability of:
  - tracker row updates
  - `Logs_DoNotEdit` appends
  - `Thread_History` appends
- Retry safety for the full user action

### Email scheduling

- Schedule create / update / delete behavior in `pages/api/email-schedule/index.ts`
- Lower-level schedule persistence in `lib/email-schedule.ts`
- Reliability of:
  - `Email_Schedule` writes
  - `Logs_DoNotEdit` appends
  - `Thread_History` appends
- Retry safety for create / update / delete actions

### Cross-cutting concerns

- Partial-write mitigation
- Duplicate-write mitigation
- Clearer user-facing failure handling
- Consistent logging semantics across these flows

---

## Out of Scope

- Reworking all `/api/update` flows beyond what is necessary for shared helpers or consistency
- Changing company-detail first-outreach wording rules
- Redesigning the email scheduling UI itself
- Broad cache architecture changes outside the affected flows
- Large data-model migrations unrelated to write reliability

---

## Current State Snapshot

### Committee workspace: bulk Log outreach

Current successful path is roughly:

1. one request from browser to `/api/committee-bulk-log-outreach`
2. one Sheets read for tracker metadata
3. one Sheets read for validation (`A2:C`)
4. one `values.batchUpdate` for selected tracker rows
5. one `values.append` to `Logs_DoNotEdit`
6. one `values.append` to `Thread_History`
7. cache invalidation and `syncDailyStats`

This is a major improvement over per-company `/api/update`, but the three business writes are still split across separate Sheets calls.

### Email scheduling

The API currently:

- saves schedule entries via `saveEmailScheduleEntries()` or deletes them via `deleteEmailScheduleEntries()`
- then separately appends `Thread_History`
- then separately appends `Logs_DoNotEdit`

So email scheduling has the same core issue: operational state and audit/history state do not succeed or fail as one logical unit.

---

## Desired Outcome

For the flows in scope, each user action should behave as one logical operation:

- either the primary sheet data and audit/history outputs are all recorded consistently
- or the request fails without leaving an ambiguous partial state

When a retry happens, the system should avoid replaying the same logical action in a way that creates duplicate log/history rows.

The final behavior should also preserve existing user-visible semantics:

- committee bulk log outreach still matches current first-outreach remark conventions
- email scheduling still records the correct action-specific history text
- access control rules remain unchanged

---

## Acceptance Criteria

### Reliability

- [ ] Committee bulk **Log outreach** no longer leaves tracker state updated while both audit/history writes are missing after a final failed request.
- [ ] Email scheduling create / update / delete no longer leaves schedule state changed while both audit/history writes are missing after a final failed request.
- [ ] Retry behavior is explicitly defined for transient failures and does not silently multiply audit/history rows for the same logical user action.

### Functional parity

- [ ] Committee bulk log outreach still writes the same business fields and remark format expected today.
- [ ] Email scheduling still writes the same schedule data and action-specific history meaning expected today.
- [ ] Existing role / impersonation restrictions still apply correctly.

### User experience

- [ ] Failure responses are clear enough that users do not mistake an ambiguous state for a safe-to-repeat clean failure.
- [ ] Success responses correspond to a reliably completed logical action, not only the first write step.

### Regression

- [ ] Other committee bulk actions outside log outreach continue to behave as they do today unless intentionally updated in follow-up work.
- [ ] Existing email schedule list, drag/drop, completion, and deletion flows still work.

---

## Risks and Edge Cases

- **Atomicity limits in Google Sheets:** some current flows use separate `values.*` operations, so reliability depends on how writes are grouped.
- **Idempotency storage choice:** dedupe behavior depends on where request keys or replay markers are stored.
- **Cloud Run retries / client ambiguity:** users may retry after timeouts even if the first request already committed.
- **Large batch sizes:** committee bulk actions and schedule operations may still hit time or quota limits if grouped poorly.
- **History wording drift:** reliability improvements must not accidentally change remark text or audit meaning.
- **Concurrency:** repeated submits from multiple tabs or users may still race unless guarded deliberately.

---

## Relevant Files

| Area | Files | Notes |
|------|-------|-------|
| Committee UI | `components/committee-workspace.tsx` | Bulk log outreach request path and retry behavior |
| Committee API | `pages/api/committee-bulk-log-outreach.ts` | Batch log-outreach write flow |
| Single-update reference | `pages/api/update.ts` | Existing tracker/log/history semantics and partial-success precedent |
| Company detail parity | `pages/companies/[id].tsx` | Source of truth for first-outreach wording |
| Email schedule page | `pages/email-schedule.tsx` | Schedule create/update/delete user flows |
| Email schedule API | `pages/api/email-schedule/index.ts` | Schedule writes plus thread/log appends |
| Email schedule persistence | `lib/email-schedule.ts` | Save/delete helpers and existing batch write behavior |
| Auth | `lib/authz.ts` | Access control rules |
| Follow-on stats/cache | `lib/daily-stats.ts`, `lib/cache.ts` | Post-write side effects on committee path |

---

## Suggested Direction

The issue should evaluate and choose a consistent reliability pattern for both flows, likely centered around:

- grouping related writes more tightly so the business write and audit/history write do not diverge
- defining how the server handles retryable failures
- defining whether idempotency is required for these actions, and if so where the dedupe key should live

The implementation does not need to force one shared helper immediately, but the final approach should avoid solving committee workspace and email scheduling in two incompatible ways unless there is a strong reason.

---

## Open Questions

- Should duplicate protection be limited to audit/history rows, or should the entire logical action be treated as idempotent?
- If idempotency is introduced, where should keys or replay markers be stored for this project and deployment model?
- Should this be delivered as one implementation pass across both flows, or committee first and email scheduling immediately after?

---

## References

- `docs/plans/committee-batch-update-plan.md`
- `docs/plans/2026-03-22-data-integrity-fixes.md`
- Google Sheets API `spreadsheets.batchUpdate`
- Google Sheets API `spreadsheets.values.batchUpdate`

