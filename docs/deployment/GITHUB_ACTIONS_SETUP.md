# GitHub Actions: Deploy Outreach Tracker to Cloud Run

This guide walks you through setting up GitHub Actions so that pushes to `main` (or a manual run) build and deploy the Outreach Tracker to Google Cloud Run.

---

## 1. Create a service account in Google Cloud

You need a service account that can deploy to Cloud Run and submit Cloud Build jobs.

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select project **company-tracker-485803** (or your project).
2. Go to **IAM & Admin** → **Service Accounts**.
3. Click **Create Service Account**.
   - **Name:** e.g. `github-actions-deploy`
   - **Description:** e.g. "Used by GitHub Actions to deploy to Cloud Run"
4. Click **Create and Continue**. Add these roles:
   - **Cloud Run Admin** – deploy and update the service
   - **Service Account User** – required for Cloud Run
   - **Cloud Build Editor** – so `gcloud run deploy --source` can build the image
   - **Artifact Registry Writer** – required for `gcloud run deploy --source` (images are pushed to the `cloud-run-source-deploy` repository)
   - **Storage Admin** (or **Storage Object Creator**) – for uploading source when using `--source`
5. Click **Done**. Do **not** grant users access unless you need to.

---

## 2. Create and download a key for the service account

1. In **Service Accounts**, click the account you just created (e.g. `github-actions-deploy`).
2. Open the **Keys** tab → **Add Key** → **Create new key** → **JSON** → **Create**.
3. A JSON key file downloads. Keep it secure; you will paste its contents into GitHub.

---

## 3. Add the key as a GitHub secret

1. Open your repo on GitHub → **Settings** → **Secrets and variables** → **Actions**.
2. Click **New repository secret**.
3. **Name:** `GCP_SA_KEY`
4. **Value:** Paste the **entire contents** of the JSON key file (one line or multi-line is fine).
5. Click **Add secret**.

The workflow uses this secret in the step:

```yaml
- uses: google-github-actions/auth@v2
  with:
    credentials_json: ${{ secrets.GCP_SA_KEY }}
```

---

## 4. When the workflow runs

- **On push to `main`**  
  Only when files under `outreach-tracker/` or the workflow file itself change (see `paths` in the workflow).

- **Manual run**  
  In the repo go to **Actions** → **Deploy Outreach Tracker** → **Run workflow** → **Run workflow**.

---

## 5. How to see when the action is triggered and deploying

1. **Open the Actions tab**  
   On GitHub: open your repo → click **Actions** in the top bar.

2. **Check the workflow run**  
   - You’ll see a run for **“Deploy Outreach Tracker”** (triggered by your push or by “Run workflow”).  
   - **Yellow circle** = running.  
   - **Green check** = succeeded.  
   - **Red X** = failed.

3. **Open the run for details**  
   Click the run (e.g. the commit message or “Deploy Outreach Tracker”). You’ll see:
   - **Build and deploy** job with steps: Checkout → Build → Authenticate → Deploy to Cloud Run → Show service URL.  
   - Click a step to expand and see logs (e.g. build output, `gcloud` deploy progress).

4. **Optional: get notified**  
   Repo **Settings** → **Notifications** → enable **Actions** (or **Watch** the repo and choose “Custom” → Actions). You’ll get emails when a workflow fails (and optionally when it succeeds).

So after you push: go to **Actions** and you’ll see the new run and whether it’s in progress or done.

---

## 6. What the workflow does

The workflow will:

1. Check out the code.
2. Run `npm ci` and `npm run build` in `outreach-tracker` (so the job fails early if the build breaks).
3. Authenticate to GCP using `GCP_SA_KEY`.
4. Run `gcloud run deploy ... --source .` from `outreach-tracker`, which builds the image in Cloud Build and deploys to Cloud Run.

---

## 7. Optional: change project or region

Edit the `env` block at the top of [`.github/workflows/deploy-outreach-tracker.yml`](../../.github/workflows/deploy-outreach-tracker.yml):

```yaml
env:
  PROJECT_ID: company-tracker-485803
  REGION: us-central1
  SERVICE_NAME: outreach-tracker
```

---

## 8. Optional: Workload Identity Federation (no key file)

For better security you can avoid storing a JSON key and use **Workload Identity Federation** so GitHub OIDC tokens are exchanged for short-lived GCP credentials. Setup is more involved:

1. In GCP: **IAM & Admin** → **Workload Identity Federation** → create a pool and provider for GitHub.
2. Allow your GitHub repo (e.g. `your-org/ME-Company-Tracker`) to impersonate the service account.
3. In the workflow, replace the `auth` step with something like:

   ```yaml
   - uses: google-github-actions/auth@v2
     with:
       workload_identity_provider: 'projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL/providers/PROVIDER'
       service_account: 'github-actions-deploy@company-tracker-485803.iam.gserviceaccount.com'
   ```

4. Remove the `GCP_SA_KEY` secret from GitHub.

If you want to switch to this later, you can update the workflow and delete the `GCP_SA_KEY` secret.

---

## 9. Troubleshooting

| Problem | What to check |
|--------|----------------|
| **Permission denied** | Service account has Cloud Run Admin, Service Account User, Cloud Build Editor, **Artifact Registry Writer**, and Storage (see step 1). |
| **`artifactregistry.repositories.get` denied** | Add the **Artifact Registry Writer** role to the service account in IAM. Deploy-from-source uses Artifact Registry; without this role the deploy step fails with PERMISSION_DENIED. |
| **Build fails in Actions** | Check the "Build (verify before deploy)" step; fix `npm run build` locally. |
| **Deploy fails** | Check the "Deploy to Cloud Run" step logs; ensure `GCP_SA_KEY` is the full JSON key. |
| **Workflow doesn’t run on push** | Confirm you pushed under `outreach-tracker/**` or the workflow file, and the branch is `main` (or change `branches` in the workflow). |

To test without pushing to `main`, use **Actions** → **Deploy Outreach Tracker** → **Run workflow** and choose your branch.
