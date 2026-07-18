# GitHub Actions: safe Outreach Tracker releases

The repository has four separate CI and release workflows:

| Workflow | Trigger | Effect |
|---|---|---|
| `Outreach Tracker CI` | Pull requests and pushes to `main` | Runs `npm ci`, reports the current lint baseline, and requires a successful build. Never deploys. |
| `Deploy Outreach Tracker Staging Candidate` | Manual only | Builds a named revision on the isolated staging service with zero service traffic. |
| `Deploy Outreach Tracker Candidate` | Manual only | Builds a named Cloud Run revision with zero service traffic. |
| `Promote Outreach Tracker Revision` | Manual only | Routes 100% traffic to one explicitly named, already-deployed revision. |

Pushing or merging application code does not deploy it and cannot promote a revision.

## 1. Protect the GitHub `production` environment

Both production workflows reference a GitHub environment named `production`. Configure it before using either workflow:

1. Open the repository's **Settings → Environments**.
2. Create or open `production`.
3. Add the appropriate required reviewer or deployment protection rule for the repository's GitHub plan.
4. Enable **Prevent self-review** where available.
5. Restrict deployment branches/tags to the approved release policy.
6. Confirm a test run waits for approval before receiving production credentials.

An `environment: production` entry in YAML does not create an approval requirement by itself; the protection rule must be configured in GitHub. See [GitHub deployment environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).

If the repository plan does not support required reviewers for its visibility, keep both workflows manual and treat the missing two-person gate as an unresolved production control. Do not claim the migration's approval gate is complete until an equivalent protection rule is available.

## 2. Configure Google Cloud authentication

The workflows currently read `GCP_SA_KEY`. Prefer storing it as a secret on the protected `production` environment so it is unavailable until the protection rules pass.

The deploy identity needs only the permissions required to build from source and manage the `outreach-tracker` Cloud Run service. Follow Google's current [Cloud Run source deployment role guidance](https://cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration#required-roles) and avoid unrelated project-wide roles.

Workload Identity Federation should replace the long-lived JSON key in a later credential-hardening change. Until then, rotate the key according to the release policy and never place it in repository files or workflow inputs.

The staging workflow reads `GCP_STAGING_SA_KEY` from a separate GitHub environment named `staging` and targets only `outreach-tracker-staging`. Task 2 must create that environment, staging-only service account, service, secrets, OAuth callback, and non-production source Sheets before anyone runs the workflow. After every Task 2 isolation check passes, set the staging environment variable `STAGING_BOUNDARIES_VERIFIED` to the exact value `true`; the workflow refuses to deploy without it. The workflow also verifies that the staging service already exists and always deploys with `--no-traffic`; it does not provision infrastructure or promote a revision.

An optional staging tag provides a directly reachable smoke-test URL even though the revision receives zero percentage-based service traffic. Remove the tag as soon as testing finishes:

```bash
gcloud run services update-traffic outreach-tracker-staging \
  --project company-tracker-485803 \
  --region us-central1 \
  --remove-tags TEMPORARY_TAG
```

## 3. Run bootstrap CI

Open a pull request and confirm `Outreach Tracker CI` installs dependencies and builds successfully:

```text
npm ci
npm run lint
npm run build
```

The repository currently has a pre-existing lint backlog, so the bootstrap workflow runs lint as a visible non-blocking check. Do not interpret that warning as a clean lint baseline. Task 3 of the Supabase migration plan will establish the clean baseline, make lint required, and add typecheck and test suites.

## 4. Deploy a zero-traffic candidate

From **Actions → Deploy Outreach Tracker Candidate → Run workflow**:

1. Choose the exact reviewed branch or commit.
2. Enter a stable revision suffix, such as `sheets-freeze-bootstrap`.
3. Leave `maintenance_mode` enabled for a freeze candidate.
4. Supply a temporary revision tag only when an operator needs a smoke-test URL.
5. Approve the protected `production` environment request.

The workflow uses `gcloud run deploy --no-traffic`. A tag provides a direct test URL but can expose the tagged revision according to the service's ingress and IAM configuration. Remove the tag as soon as smoke testing finishes:

```bash
gcloud run services update-traffic outreach-tracker \
  --project company-tracker-485803 \
  --region us-central1 \
  --remove-tags sheets-freeze-bootstrap
```

Before promotion, verify the candidate's revision name, image digest, environment configuration, maintenance behavior, and current traffic table.

## 5. Promote an approved revision

Promotion is a separate manual workflow:

1. Open **Actions → Promote Outreach Tracker Revision → Run workflow**.
2. Enter the exact immutable Cloud Run revision name reported by the candidate workflow.
3. Enter `PROMOTE` in the confirmation field.
4. Review and approve the protected `production` environment request.
5. Verify the post-promotion traffic table names the intended revision at 100%.

Never promote a revision suffix, `latest`, or an unverified image. During the Sheets-to-Postgres cutover, do not use percentage traffic splitting between revisions backed by different data stores.

## 6. Bootstrap freeze verification

For the temporary `sheets-freeze-bootstrap` candidate, enable maintenance mode and verify the temporary tag returns `503` for at least:

- `GET /api/data`
- `GET /api/limits`
- schedule GET routes
- representative POST/PATCH/DELETE mutations

`/api/auth/*`, the maintenance page, and static assets remain available. No internal migration endpoint is allowlisted until its dedicated token protection exists.

After recording the results, remove the temporary tag. Do not promote the bootstrap freeze revision during this verification.

## Troubleshooting

| Problem | Check |
|---|---|
| Workflow starts without waiting | Configure required reviewers or another protection rule on the GitHub `production` environment. |
| Candidate receives normal service traffic | Stop and inspect the workflow; candidate deployment must include `--no-traffic`. |
| Tagged URL is unreachable | Check the tag, Cloud Run ingress, IAM, and whether unauthenticated access is intended. |
| Source build is denied | Re-check the current Cloud Run source deployment roles and service-account impersonation. |
| CI fails | Reproduce from `outreach-tracker/` with `npm ci` and `npm run build`; inspect the separate non-blocking lint output as tracked baseline debt. |
| Promotion targets the wrong revision | Do not retry with `latest`; copy the exact immutable revision name from the verified candidate output. |
