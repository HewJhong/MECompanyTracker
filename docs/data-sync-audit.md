# Data Push / Fetch Sync Audit

This document records a systematic check of all data writes and reads in the codebase to ensure cache invalidation and client refetch behavior avoid syncing issues.

**Last audit:** 2025-03-10

---

## 1. Backend cache keys

| Cache key | Used by | Invalidated when |
|-----------|---------|------------------|
| `sheet_data` | `/api/data` | All write APIs that change tracker/DB (see below) |
| `company_database` | (reorder-rows) | `reorder-rows.ts` only |
| `email_schedule` | `lib/email-schedule.ts` getEmailSchedule() | save/delete schedule, settings save |
| `email_schedule_YYYY-MM-DD` | getEmailSchedule(date) | same as above (now cleared via deleteCacheKeysAndPrefix) |
| `email_schedule_settings` | getEmailScheduleSettings() | save settings, invalidateScheduleCache() |
| `committee_members` | lib/committee-members getCommitteeMembers() | Not written by app; sheet edited manually |

---

## 2. Write APIs and cache invalidation

| API | Writes | Cache invalidation | Status |
|-----|--------|--------------------|--------|
| `POST /api/update` | Tracker row (company) | `cache.delete('sheet_data')` | OK |
| `POST /api/update-contact` | Tracker (contact row) | `cache.delete('sheet_data')` | OK |
| `POST /api/add-contact` | Tracker append | `cache.delete('sheet_data')` | OK |
| `POST /api/delete-contact` | Tracker row clear | `cache.delete('sheet_data')` | OK |
| `POST /api/set-primary-contact` | Tracker row | `cache.delete('sheet_data')` | OK |
| `POST /api/bulk-assign` | Tracker (PIC, Last Updated), Email_Schedule | `cache.delete('sheet_data')`; schedule via invalidateScheduleCache() in saveEmailScheduleEntries | OK |
| `POST /api/add-company` | DB + Tracker append | `cache.clear()` | OK |
| `POST /api/companies/insert` | DB + Tracker insert | `cache.clear()` | OK |
| `POST /api/duplicates/merge` | Tracker + DB | `cache.delete('sheet_data')` | OK |
| `POST /api/sync-database` | Tracker sync | `cache.delete('sheet_data')` | OK |
| `POST /api/reorder-rows` | Tracker + DB order | `cache.delete('sheet_data')`, `cache.delete('company_database')` | OK |
| `POST /api/id-gaps/fix` | Tracker + DB renumber | `cache.clear()` | OK |
| `POST /api/import/previous-responses` | DB column E | `cache.clear()` | OK |
| `GET/POST/PUT/DELETE /api/email-schedule` | Email_Schedule sheet | invalidateScheduleCache() in save/delete/settings | OK (fixed: date-prefixed keys now cleared) |
| `POST /api/email-schedule/settings` | Email_Schedule_Settings | cache.delete(CACHE_KEY_SETTINGS) in lib | OK |

---

## 3. Client-side refetch after mutations

| Page / Component | Mutation | Refetch / state update after success | Status |
|------------------|----------|--------------------------------------|--------|
| **companies.tsx** | Bulk assign (with/without schedule) | Optimistic PIC + scheduleMap; background refetch `/api/data?refresh=true` + `/api/email-schedule`; syncing bar until done | OK |
| **companies.tsx** | Add company (modal) | `onSuccess` → `fetchData()` | OK |
| **companies/[id].tsx** | Save company (update) | Optimistic; `fetchData(true)` in background | OK |
| **companies/[id].tsx** | Update contact | Optimistic; `fetchData(true)` in background | OK |
| **companies/[id].tsx** | Add contact | Optimistic; `fetchData(true)` in background | OK |
| **companies/[id].tsx** | Delete contact | Optimistic; `fetchData(true)` in background | OK |
| **companies/[id].tsx** | Set/clear primary contact methods | Optimistic; `fetchData(true)` in background | OK |
| **companies/[id].tsx** | Set outreach schedule | `fetchScheduleForCompany()` after POST/DELETE | OK |
| **companies/[id].tsx** | Clear outreach schedule | `fetchScheduleForCompany()` after DELETE | OK |
| **committee.tsx** | CommitteeWorkspace bulk actions (first outreach, follow-up, etc.) | `onRefresh={fetchData}`; fetchData fetches `/api/data` + `/api/email-schedule` | OK |
| **email-schedule.tsx** | Move companies (drag or bulk move) | Optimistic setEntries; then `fetchEntries({ silent: true })` (grid-only sync) | OK |
| **email-schedule.tsx** | Change PIC (bulk) | Optimistic; PUT response merged into state (no refetch to avoid stale cache) | OK |
| **email-schedule.tsx** | Bulk delete from schedule | Optimistic; `fetchEntries({ silent: true })` | OK |
| **DuplicateMergeModal** | Merge duplicates | `onMergeComplete()` (parent refetches as needed) | OK |
| **settings.tsx** | Sync database, id-gaps fix, insert company, import, reorder, limits POST | Caller-specific; typically UI refresh or redirect | OK |

---

## 4. Fix applied during this audit

- **Email schedule cache:** `invalidateScheduleCache()` previously only deleted `email_schedule` and `email_schedule_settings`. GET with `?date=YYYY-MM-DD` uses key `email_schedule_YYYY-MM-DD`, which was not cleared, so date-filtered reads could serve stale data for up to TTL (1 min). **Fix:** Added `deleteCacheKeysAndPrefix()` in `lib/cache.ts` and use it in `invalidateScheduleCache()` to clear all keys equal to or prefixed with `email_schedule` / `email_schedule_settings`, including `email_schedule_*` date keys.

---

## 5. Recommendations

1. **Committee members:** If you add an admin action that updates the Committee_Members sheet (e.g. “Refresh from sheet”), support `?refresh=true` on `/api/committee-members` and bypass or invalidate `committee_members` cache in that case.
2. **Consistency:** All write APIs that modify data used by `/api/data` now invalidate `sheet_data` or clear the full cache; no gaps found.
3. **Email schedule:** After this fix, all schedule reads (full or by date) see fresh data after any schedule write.
