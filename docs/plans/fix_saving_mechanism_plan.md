# Implementation Plan - Fix Saving and Update Mechanism

## Phase 1: Backend API Fixes

- [x] **Task 1.1**: Update `pages/api/update.ts` to support `lastCompanyActivity` and `isFlagged`. (COMPLETED - Note: mapping for `isFlagged` column N still needs verification if schema is updated)
- [x] **Task 1.2**: Update `pages/api/update.ts` to include verification step. (COMPLETED - returns `verifiedData`)
- [x] **Task 1.3**: Fix "No Reply" auto-logic in `pages/api/update.ts`. (COMPLETED - skips if status is manually updated)
- [x] **Task 1.4**: Update `pages/api/data.ts` to support `refresh=true` bypass. (COMPLETED)

## Phase 2: Frontend Sync Fixes

- [x] **Task 2.1**: Update `pages/companies/[id].tsx` to use `verifiedData` from API. (COMPLETED)
- [x] **Task 2.2**: Update `pages/companies/[id].tsx` to use `fetchData(true)` for forced refresh. (COMPLETED)

## Phase 3: Verification

- [ ] **Task 3.1**: Verify "Update Status" to "To Contact" persists after refresh.
- [ ] **Task 3.2**: Verify "Request Attention" (Flag) persists after refresh (Requires schema check).
