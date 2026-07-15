#!/usr/bin/env bash
# Deploy an Outreach Tracker candidate revision to Google Cloud Run with zero traffic.
# Promotion is intentionally a separate operation.
# Run from repo root: ./outreach-tracker/deploy.sh
# Or from outreach-tracker: ./deploy.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PROJECT="${GCLOUD_PROJECT:-company-tracker-485803}"
REGION="${GCLOUD_REGION:-us-central1}"
SERVICE="${CLOUD_RUN_SERVICE:-outreach-tracker}"
REVISION_SUFFIX="${REVISION_SUFFIX:-}"
REVISION_TAG="${REVISION_TAG:-}"
MAINTENANCE_MODE="${MAINTENANCE_MODE:-1}"

if [[ -z "$REVISION_SUFFIX" ]]; then
  echo "REVISION_SUFFIX is required; refusing an implicit production deployment." >&2
  echo "Example: REVISION_SUFFIX=sheets-freeze-bootstrap MAINTENANCE_MODE=1 ./outreach-tracker/deploy.sh" >&2
  exit 1
fi

if [[ ! "$REVISION_SUFFIX" =~ ^[a-z][a-z0-9-]{0,40}[a-z0-9]$ ]]; then
  echo "Invalid revision suffix: $REVISION_SUFFIX" >&2
  exit 1
fi

if [[ -n "$REVISION_TAG" && ! "$REVISION_TAG" =~ ^[a-z][a-z0-9-]{0,61}[a-z0-9]$ ]]; then
  echo "Invalid revision tag: $REVISION_TAG" >&2
  exit 1
fi

if [[ "$MAINTENANCE_MODE" != "0" && "$MAINTENANCE_MODE" != "1" ]]; then
  echo "MAINTENANCE_MODE must be 0 or 1." >&2
  exit 1
fi

echo "Building locally before creating a candidate..."
npm run build

deploy_args=(
  run deploy "$SERVICE"
  --source .
  --project "$PROJECT"
  --region "$REGION"
  --revision-suffix "$REVISION_SUFFIX"
  --update-env-vars "MAINTENANCE_MODE=$MAINTENANCE_MODE"
  --no-traffic
)

if [[ -n "$REVISION_TAG" ]]; then
  deploy_args+=(--tag "$REVISION_TAG")
fi

echo "Creating zero-traffic candidate (project=$PROJECT, region=$REGION, service=$SERVICE)..."
gcloud "${deploy_args[@]}"

echo "Candidate created. Production traffic was not changed."
gcloud run services describe "$SERVICE" \
  --project "$PROJECT" \
  --region "$REGION" \
  --format='table(status.traffic.revisionName,status.traffic.percent,status.traffic.tag,status.traffic.url)'
