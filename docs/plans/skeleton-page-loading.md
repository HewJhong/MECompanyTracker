# Plan: skeleton wireframe loading for Dashboard, Analytics, Email Schedule

- **Type:** feature (UX)
- **Status:** IMPLEMENTED
- **Map version referenced:** `docs/codebase-map.md` @ commit `688897f` (2026-07-03) — **stale**: §3 still lists page bodies as the `pages/*.tsx` files, but those routes are now thin `dynamicPageContent` wrappers around `components/{Dashboard,Analytics,EmailSchedule}Board.tsx`. §4 does not list `PageContentLoader.tsx`, `lib/dynamic-page-content.tsx`, or the board components. Engineer should note these gaps; a full cartographer re-run is not required for this change.

## Context

On `/`, `/analytics`, and `/email-schedule`, the data-loading state is a centered spinner inside a bordered white card (`PageContentLoader` at [components/PageContentLoader.tsx:26-29](outreach-tracker/components/PageContentLoader.tsx#L26)). When data arrives, that card is replaced by the real layout (metric grids, charts, week calendar), so the page jumps.

The same boxed spinner is also used as the `next/dynamic` chunk-load fallback via [lib/dynamic-page-content.tsx:10-12](outreach-tracker/lib/dynamic-page-content.tsx#L10) for those three routes.

User-approved direction (this conversation): **page-shaped skeleton wireframes** that keep each page’s real header and mirror the loaded content layout with pulsing placeholders. Also unbox the shared spinner so other consumers (companies, committee, auth bootstrap) no longer show the bordered card.

## Design

### Approach

1. **Shared skeleton primitives** — small `Bone` / card shell helpers (`animate-pulse`, slate fills) in one file.
2. **Three page skeletons** — `DashboardSkeleton`, `AnalyticsSkeleton`, `EmailScheduleSkeleton` that approximate each board’s content grid (not pixel-perfect clones).
3. **Keep real headers** — each board already renders its title/refresh chrome *above* the loading gate; skeletons replace only the content branch (current `PageContentLoader` call sites).
4. **Chunk-load fallback** — extend `dynamicPageContent` so `/`, `/analytics`, and `/email-schedule` can pass the matching skeleton instead of the generic spinner during JS chunk load.
5. **Unbox `PageContentLoader`** — remove `rounded-xl border … bg-white`; keep a plain centered spinner for remaining call sites and `fullScreen` auth bootstrap.

### Skeleton layouts (content area only)

**Dashboard** (mirrors [DashboardBoard.tsx:490+](outreach-tracker/components/DashboardBoard.tsx#L490)):
- Row: `grid lg:grid-cols-4` — two metric cards + one `lg:col-span-2` card
- Row: full-width breakdown card with 4 inner blocks
- Row: `lg:grid-cols-3` — `lg:col-span-2` chart card + one side list card

**Analytics** (mirrors [AnalyticsBoard.tsx:442+](outreach-tracker/components/AnalyticsBoard.tsx#L442)):
- Row: `md:grid-cols-3` — three metric cards
- Row: `lg:grid-cols-3` — three distribution cards
- Row: wide chart card (`h-64`-ish)
- Row: `lg:grid-cols-3` — three table/list cards

**Email Schedule** (mirrors [EmailScheduleBoard.tsx:1513+](outreach-tracker/components/EmailScheduleBoard.tsx#L1513)):
- Week nav strip (prev / Today / next + date-range bone)
- Legend + view-toggle strip
- Horizontal flex of **7** day columns (`w-[320px]`), each with header bone + 5–6 slot bones

Use `aria-busy="true"` and `aria-label` on the skeleton root; bones are decorative (`aria-hidden`).

### Rejected alternative

**Only remove the box from `PageContentLoader` (plain spinner).** Rejected because the user explicitly chose wireframes: a centered spinner still collapses the content region to ~28rem of empty space, then the real multi-row layout expands in — the layout jump remains. Skeletons preserve approximate height and set expectations for what will appear.

## Change Steps

### 1. New file: `outreach-tracker/components/Skeleton.tsx`

Add reusable primitives, e.g.:

```ts
export function Bone({ className }: { className?: string }) { /* animate-pulse rounded bg-slate-200 */ }
export function SkeletonCard({ className, children }: …) { /* white rounded-2xl border p-6 shell */ }
```

No page-specific layouts here — only building blocks.

**Acceptance criterion:** `Bone` and `SkeletonCard` render pulse placeholders with no border-box spinner; importing the module does not pull board code.

### 2. New file: `outreach-tracker/components/PageSkeletons.tsx`

Export `DashboardSkeleton`, `AnalyticsSkeleton`, `EmailScheduleSkeleton` using Step 1 primitives and the layouts in Design. Keep each skeleton self-contained (no data props).

**Acceptance criterion:** each export visually approximates its board’s content grid at desktop width (metric/chart/day-column structure recognizable); no spinner; no page header inside the skeleton (headers stay in the boards).

### 3. `outreach-tracker/components/PageContentLoader.tsx` — unbox non-fullscreen loader

Change the non-`fullScreen` return ([PageContentLoader.tsx:26-29](outreach-tracker/components/PageContentLoader.tsx#L26)) from:

```tsx
<div className="… min-h-[28rem] … rounded-xl border border-slate-200 bg-white">
```

to a borderless, background-less centered flex (keep `min-h-[28rem]` or similar so short pages don’t collapse). Leave `fullScreen` auth bootstrap unchanged in spirit (full viewport center, no content card).

**Acceptance criterion:** companies/committee/settings/company-detail loading states (still using `PageContentLoader`) show a spinner with **no** bordered white card; fullscreen auth loader on `/` still centers on the viewport.

### 4. `outreach-tracker/components/DashboardBoard.tsx` — swap content loader

At the loading branch ([DashboardBoard.tsx:483-484](outreach-tracker/components/DashboardBoard.tsx#L483)), replace `<PageContentLoader label="Loading command center…" />` with `<DashboardSkeleton />`. Remove unused `PageContentLoader` import if no longer referenced.

**Acceptance criterion:** cold load of `/` with empty cache shows Command Center header + dashboard skeleton; after data loads, skeleton is replaced by real metrics with no intermediate bordered spinner.

### 5. `outreach-tracker/components/AnalyticsBoard.tsx` — swap content loader

At [AnalyticsBoard.tsx:435-436](outreach-tracker/components/AnalyticsBoard.tsx#L435), replace `<PageContentLoader label="Loading analytics…" />` with `<AnalyticsSkeleton />`. Drop unused import.

**Acceptance criterion:** cold load of `/analytics` shows page header + analytics skeleton; loaded state matches existing analytics layout without a boxed spinner flash.

### 6. `outreach-tracker/components/EmailScheduleBoard.tsx` — swap content loader

At [EmailScheduleBoard.tsx:1359-1360](outreach-tracker/components/EmailScheduleBoard.tsx#L1359) (`showContentLoader` branch), replace `<PageContentLoader label="Loading schedule…" />` with `<EmailScheduleSkeleton />`. Drop unused import.

**Acceptance criterion:** cold load / auth+data wait on `/email-schedule` shows Email Schedule header + week-grid skeleton (7 day columns); after load, real week grid appears without a bordered spinner card.

### 7. `outreach-tracker/lib/dynamic-page-content.tsx` + three page wrappers — skeleton during chunk load

Extend `dynamicPageContent` to accept an optional React node (or component) for the dynamic `loading` fallback, defaulting to current `PageContentLoader` for backward compatibility:

```ts
export function dynamicPageContent(importFn, label, LoadingFallback?)
```

Update:
- [pages/index.tsx](outreach-tracker/pages/index.tsx) → pass `DashboardSkeleton`
- [pages/analytics.tsx](outreach-tracker/pages/analytics.tsx) → pass `AnalyticsSkeleton`
- [pages/email-schedule.tsx](outreach-tracker/pages/email-schedule.tsx) → pass `EmailScheduleSkeleton`

Other pages that use `dynamicPageContent` keep the default unboxed spinner unless they already pass nothing (unchanged API).

**Acceptance criterion:** with a cold JS cache (or throttled network), navigating to `/`, `/analytics`, or `/email-schedule` shows the matching skeleton inside `Layout` while the board chunk loads — not the bordered spinner card. Companies/committee chunk fallback still uses (unboxed) `PageContentLoader`.

### 8. Map note (optional, light)

If the engineer touches docs: add one line under components in `docs/codebase-map.md` §4 noting `PageContentLoader` / `PageSkeletons` — not required for merge.

**Acceptance criterion:** no broken links; skip if not editing the map.

## Verification strategy

No automated test suite (per CLAUDE.md). Manual:

1. `cd outreach-tracker && npm run lint` — clean on touched files.
2. `npm run build` — succeeds.
3. Hard-reload `/` with empty `localStorage` (or DevTools → Application → clear site data for the origin): header + dashboard skeleton → real Command Center; no bordered spinner box.
4. Same for `/analytics` and `/email-schedule`.
5. Navigate away/back with warm cache: instant paint / brief skeleton only if data gate still true; no layout jump from a card spinner.
6. Spot-check `/companies` or `/committee` loading: unboxed spinner only (no white bordered card).
7. Signed-out `/` auth bootstrap: fullscreen loader still OK.

## Risks & rollback

| Risk | Mitigation |
|---|---|
| Skeletons drift from real layout after future board redesigns | Keep skeletons coarse (grids + bones), not pixel clones; update only when layout rows change |
| Chunk-load skeleton lacks page header (board not mounted yet) | Acceptable: Layout chrome + content skeleton; header appears when board mounts — still better than a boxed spinner. Do **not** duplicate headers in skeletons (would double-render once board mounts) |
| Extra DOM during load | Negligible; skeletons are static |

**Rollback:** revert the PR / restore `PageContentLoader` call sites; delete `Skeleton.tsx` + `PageSkeletons.tsx`.

## Out of scope

- Skeletonizing companies, committee, company detail, or settings
- Changing data-fetch / cache / instant-paint logic
- Adding a skeleton library (e.g. react-loading-skeleton)
- Animating skeleton → content crossfade
- Redesigning loaded page layouts
- Fixing map staleness beyond an optional one-line note

## Open questions

_None — user confirmed skeleton wireframes for Dashboard, Email Schedule, and Analytics; unboxed spinner as shared fallback elsewhere._

## Implementation Report

### Packet table

| Packet | Steps | Files | Wave | Model | Rework | Verdict |
|---|---|---|---|---|---|---|
| A | 3 | `PageContentLoader.tsx` | 1 | sonnet | 0 | Accept |
| B | 1–2 | `Skeleton.tsx`, `PageSkeletons.tsx` | 1 | sonnet | 0 | Accept |
| C | 4–6 | `DashboardBoard`, `AnalyticsBoard`, `EmailScheduleBoard` | 2 | sonnet | 0 | Accept |
| D | 7 | `dynamic-page-content.tsx`, `pages/{index,analytics,email-schedule}.tsx` | 2 | sonnet | 0 | Accept |

### Per-step

1. **Skeleton.tsx** — `Bone` + `SkeletonCard` primitives added.
2. **PageSkeletons.tsx** — `DashboardSkeleton`, `AnalyticsSkeleton`, `EmailScheduleSkeleton` match plan layouts (no headers, aria-busy).
3. **PageContentLoader** — non-fullscreen lost `rounded-xl border … bg-white`; fullscreen unchanged.
4–6. Boards swap content loaders to matching skeletons; `PageContentLoader` imports removed from all three.
7. `dynamicPageContent(importFn, label, LoadingFallback?)`; `/`, `/analytics`, `/email-schedule` pass skeletons. Other pages untouched.
8. Map note skipped (optional).

### Deviations

None.

### Noticed, not touched

- Pre-existing lint errors in board files (`any`, unescaped entities, unused imports) — unrelated to this change.
- Repo-wide `npm run lint` still fails on scripts/ legacy issues (pre-existing).

### Whole-repo verification

- Touched-file eslint: no new issues in `Skeleton.tsx`, `PageSkeletons.tsx`, `PageContentLoader.tsx`, `dynamic-page-content.tsx`, or the three page wrappers.
- `npm run build` — **exit 0**; routes `/`, `/analytics`, `/email-schedule` generated successfully.

### Map updated

No.
