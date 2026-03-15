# Deploy Outreach Tracker to Google Cloud Run

## Recommended: use the deploy script

From the **repo root**:

```bash
./outreach-tracker/deploy.sh
```

Or from `outreach-tracker/`:

```bash
./deploy.sh
```

The script builds locally first (so you catch errors before deploy), then runs `gcloud run deploy`. Override project/region with env vars if needed:

```bash
GCLOUD_PROJECT=company-tracker-485803 GCLOUD_REGION=us-central1 ./outreach-tracker/deploy.sh
```

---

## One-off command (manual deploy)

From the **outreach-tracker** directory:

```bash
gcloud run deploy outreach-tracker \
  --source . \
  --project company-tracker-485803 \
  --region us-central1 \
  --allow-unauthenticated \
  --min-instances 1
```

---

## Better ways to deploy

| Approach | When to use |
|----------|-------------|
| **`deploy.sh`** | Day-to-day updates: one command, local build first, same options every time. |
| **Cloud Build trigger** | Deploy on every push to `main` (or a release branch). Build and deploy in the cloud; no need to run gcloud from your machine. |
| **GitHub Actions** | Same as above, with workflows in the repo (e.g. run tests, then deploy to Cloud Run). |

To add a **Cloud Build trigger**: In Google Cloud Console → Cloud Build → Triggers, create a trigger that runs on push to your repo and uses a `cloudbuild.yaml` that runs `gcloud run deploy` (or builds the image and deploys). Your existing Dockerfile in `outreach-tracker/` can be used by Cloud Build.

**GitHub Actions** is set up. See **[GitHub Actions setup guide](GITHUB_ACTIONS_SETUP.md)** for creating the GCP service account, adding the `GCP_SA_KEY` secret, and when the workflow runs.

For now, using **`./outreach-tracker/deploy.sh`** is the simplest improvement: consistent command, local build first, and easy to extend (e.g. run lint, tag revision, or update env vars).
