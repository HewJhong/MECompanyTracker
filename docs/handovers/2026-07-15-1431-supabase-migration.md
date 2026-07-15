# Supabase migration handover

- **Recorded:** 2026-07-15 14:31:45 SGT (UTC+08:00)
- **Workspace:** `/home/jinhong/projects/ME Company Tracker`
- **Active branch:** `feature/skeleton-page-loading`

## Objective

Replace Google Sheets as the Outreach Tracker runtime store with Supabase Postgres through an isolated staging rehearsal and a controlled production cutover. The implementation authority is currently the untracked workspace file `docs/plans/2026-07-15-supabase-migration-consolidated.md`.

## Progress completed

The first repository-side deployment-safety slice is complete:

- Commit `9826d1d` (`ci: stop automatic production promotion`) was created and pushed to `origin/feature/skeleton-page-loading`.
- Pushes to `main` no longer trigger the production deployment workflow once this change reaches the default branch.
- Production candidate deployment is manual, references the GitHub `production` environment, and uses `gcloud run deploy --no-traffic`.
- Production traffic promotion is a separate manual workflow that requires an exact immutable revision name and `PROMOTE` confirmation.
- Bootstrap CI installs locked dependencies, reports the existing lint baseline without blocking, and requires a successful production build.
- The local deployment script refuses an implicit deployment and always creates a named zero-traffic candidate.
- Maintenance mode blocks every non-auth API request, including GET, HEAD, and mutations. NextAuth routes remain allowed.
- Deployment setup and operator command documentation were updated.

## Verification evidence

- `npm ci`: passed after allowing registry access.
- `npm run build`: passed with Next.js 16.1.6.
- Focused `eslint middleware.ts`: passed.
- Workflow YAML parsing, shell syntax, and `git diff --check`: passed.
- Local maintenance-mode checks returned `503` for:
  - `GET /api/data`
  - `GET /api/limits`
  - `GET /api/email-schedule`
  - `POST /api/clear-cache`
  - `HEAD /api/data`
- The blocked response included `Cache-Control: no-store` and `Retry-After: 600`.
- `/api/auth/session` passed middleware and then failed only because the temporary local production server intentionally lacked `NEXTAUTH_SECRET`.
- Independent review found no critical or important issues. Its one minor revision-name regex mismatch was fixed before commit.

The full repository lint currently reports 144 pre-existing errors outside this safety change. Bootstrap CI therefore keeps lint advisory until migration Task 3 establishes a clean baseline and makes it required.

## Git and remote notes

- The safety commit was pushed successfully through the configured remote URL.
- GitHub reported that the repository moved from `HewJhong/ME-Company-Tracker` to `HewJhong/MECompanyTracker`. The configured `origin` still uses the old redirecting URL; update it deliberately in a later session.
- `origin/main` is at `5cf98d4`, while this branch contains the equivalent unsquashed parent `f52e78f`. Those two commits have identical trees but different hashes. A pull request from the current branch may display the already-merged skeleton commit history. Before opening the safety PR, create a clean branch from current `origin/main` and carry over only the safety and handover commits, or rebase carefully and push with lease after user approval.

## Working-tree boundaries

The following pre-existing work remains outside the safety commit and must be preserved:

- Modified: `docs/deployment/SUPABASE_SETUP.md`
- Modified: `docs/user_stories.json`
- Modified: `outreach-tracker/middleware.ts` — the remaining unstaged portion is API-origin logging layered on top of the committed maintenance hardening
- Untracked planning/review files, including the consolidated Supabase migration plan, `docs/codebase-map.md`, and `docs/reviews/`
- Untracked local agent/run artifacts such as `.claude/`, `agents.ndjson`, `checkpoints.ndjson`, `run_events.ndjson`, and `runs.ndjson`

Do not use `git add .`, stash, reset, or clean these files without explicit user direction.

## External controls still required

Repository code is ready, but the production safety control is not operational until all of the following occur:

1. Put the safety changes on a clean branch based on current `origin/main`, then open and merge a focused pull request.
2. Confirm bootstrap CI builds successfully on the pull request.
3. Configure required reviewers or an equivalent protection rule on GitHub's `production` environment. Merely naming the environment in workflow YAML does not enable approval protection.
4. Run the manual candidate workflow from a non-main branch and confirm production traffic/configuration does not change.
5. Create the tagged zero-traffic `sheets-freeze-bootstrap` revision with maintenance enabled.
6. Verify the documented API matrix returns `503`, record the evidence, and remove the temporary public tag.

No Cloud Run deployment, traffic change, GitHub environment configuration, or tag creation/removal has been performed yet.

## Recommended next session

Start by checking `git status`, `git log --graph --all`, and the newest remote refs. Then make the branch history clean for a focused safety PR without touching the unrelated working tree. After the PR/environment controls are handled, resume migration Task 0: generate the current-HEAD storage and behavior inventory and collect the external Sheets integration/owner decisions.
