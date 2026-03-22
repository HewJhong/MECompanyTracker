# Audit-Based ID Recovery – Design

**Date:** 2026-03-22  
**Goal:** Use Logs_DoNotEdit and Thread_History (kept immutable during sync) as an audit trail to trace back and fix incorrect ID↔Company mappings in the main spreadsheet.

## Context

- **Logs_DoNotEdit** and **Thread_History** record activity with company IDs and names.
- If sync or other processes introduce wrong ID↔Company mappings, the main Companies sheet can become inconsistent.
- Logs and Thread_History are a reliable source of truth when they are not overwritten during sync.

## Design Decisions

1. **Stop altering Logs and Thread_History during sync** – Sync will update the main Companies sheet, Email_Schedule, etc., but will not modify existing rows in Logs_DoNotEdit or Thread_History. New rows may still be appended (e.g. SYNC_ID_FIX audit entries).

2. **Recovery tool uses logs to build an audit map** – Parses log entries to extract `ID → company names` and uses that to compare against the current Companies sheet.

## Log Patterns for ID→Company Extraction

| Action        | Source  | Pattern(s)                        |
|---------------|---------|-----------------------------------|
| COMPANY_UPDATE| Details | `ME-XXXX – Company Name`         |
| BULK_ASSIGN   | Data    | `ME-XXXX (Company Name) → time`   |
| BULK_ASSIGN   | Data    | `ME-XXXX (Company Name)`          |
| CONTACT_*     | Details | `ME-XXXX – ...` (ID only)         |

Thread_History column B provides company IDs; names come from Logs.

## Architecture

- **API:** `GET /api/audit-recover-ids` – scan; `POST /api/audit-recover-ids` – apply fixes (with body `{ corrections: [...] }`).
- **Auth:** Superadmin only (same as sync, ID gaps).
- **Flow:** Scan → extract audit map → compare to Companies → report mismatches → (optional) apply corrections.

## Mismatch Detection

For each row in the Companies sheet with `(currentId, currentName)`:

- Look up `auditMap[currentId]` = set of company names from logs.
- If the set is non-empty and `currentName` is not in it (normalized) → mismatch.
- Report: row index, current ID, current name, expected names from logs, sources.

## Correction Application

When corrections are applied:

- Update the Companies sheet (and Email_Schedule if IDs change).
- Do not update Logs or Thread_History; they remain as the audit trail.
- Append an audit entry to Logs_DoNotEdit describing the correction.
