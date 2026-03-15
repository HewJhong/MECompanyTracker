#!/usr/bin/env bash
# Deploy Outreach Tracker to Google Cloud Run.
# Run from repo root: ./outreach-tracker/deploy.sh
# Or from outreach-tracker: ./deploy.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PROJECT="${GCLOUD_PROJECT:-company-tracker-485803}"
REGION="${GCLOUD_REGION:-us-central1}"
SERVICE="outreach-tracker"

echo "Building locally first (catches errors before deploy)..."
npm run build

echo "Deploying to Cloud Run (project=$PROJECT, region=$REGION)..."
gcloud run deploy "$SERVICE" \
  --source . \
  --project "$PROJECT" \
  --region "$REGION" \
  --allow-unauthenticated \
  --min-instances 1

echo "Done. Service URL:"
gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format='value(status.url)'
