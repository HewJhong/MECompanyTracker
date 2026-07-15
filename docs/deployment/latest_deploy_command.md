# Outreach Tracker Cloud Run release commands

Production releases have two separate operations: create a zero-traffic candidate, then explicitly promote a verified immutable revision.

The protected GitHub Actions workflows are preferred. These local commands are for an authorized operator using equivalent production approval controls.

## Create a zero-traffic candidate

From the repository root:

```bash
REVISION_SUFFIX=sheets-freeze-bootstrap \
MAINTENANCE_MODE=1 \
./outreach-tracker/deploy.sh
```

To create a temporary smoke-test URL, add a tag:

```bash
REVISION_SUFFIX=sheets-freeze-bootstrap \
REVISION_TAG=sheets-freeze-bootstrap \
MAINTENANCE_MODE=1 \
./outreach-tracker/deploy.sh
```

The script builds locally, deploys with `--no-traffic`, and prints the service traffic table. It refuses to run without an explicit revision suffix. Bootstrap CI reports the repository's existing lint backlog separately; Task 3 makes lint a required gate after establishing a clean baseline.

Override the target only when intentionally working with another isolated environment:

```bash
GCLOUD_PROJECT=company-tracker-485803 \
GCLOUD_REGION=us-central1 \
CLOUD_RUN_SERVICE=outreach-tracker \
REVISION_SUFFIX=reviewed-candidate \
MAINTENANCE_MODE=1 \
./outreach-tracker/deploy.sh
```

## Verify a freeze candidate

Against its temporary tag URL, verify all non-auth APIs are blocked regardless of HTTP method:

```bash
curl -i https://TAGGED-REVISION-URL/api/data
curl -i https://TAGGED-REVISION-URL/api/limits
curl -i https://TAGGED-REVISION-URL/api/email-schedule
curl -i -X POST https://TAGGED-REVISION-URL/api/clear-cache
```

Each request must return `503` with `Cache-Control: no-store` and `Retry-After: 600`.

Remove the temporary tag after verification:

```bash
gcloud run services update-traffic outreach-tracker \
  --project company-tracker-485803 \
  --region us-central1 \
  --remove-tags sheets-freeze-bootstrap
```

## Promote an exact revision

Use **Actions → Promote Outreach Tracker Revision** whenever possible. For an authorized manual recovery operation, route traffic only by exact immutable revision name:

```bash
gcloud run services update-traffic outreach-tracker \
  --project company-tracker-485803 \
  --region us-central1 \
  --to-revisions outreach-tracker-EXACT-REVISION=100
```

Then verify:

```bash
gcloud run services describe outreach-tracker \
  --project company-tracker-485803 \
  --region us-central1 \
  --format='table(status.traffic.revisionName,status.traffic.percent,status.traffic.tag,status.traffic.url)'
```

Do not use `--to-latest` for a production release. Do not percentage-split traffic between Sheets-backed and Postgres-backed revisions.

## Important maintenance rule

Do not toggle `MAINTENANCE_MODE` on the live service during a migration window. Updating a Cloud Run environment variable creates a new revision and can change traffic unexpectedly. Pre-build and verify distinct frozen/live revisions at zero traffic, then route to the exact named revision required by the runbook.

Cloud Run service environment variables and secrets remain managed separately. Prefer `--update-env-vars` and `--update-secrets` for deliberate configuration changes; `--set-*` replaces the complete corresponding set.
