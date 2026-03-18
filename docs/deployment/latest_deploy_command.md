# Deploy Outreach Tracker (Cloud Run) — commands

## Deploy (recommended)

From repo root:

```bash
./outreach-tracker/deploy.sh
```

Override project/region if needed:

```bash
GCLOUD_PROJECT=company-tracker-485803 GCLOUD_REGION=us-central1 ./outreach-tracker/deploy.sh
```

## Deploy (manual one-off)

From `outreach-tracker/`:

```bash
gcloud run deploy outreach-tracker \
  --source . \
  --project company-tracker-485803 \
  --region us-central1 \
  --allow-unauthenticated \
  --min-instances 1
```

## Set production config (env vars + secrets)

Notes:
- `outreach-tracker/.env.local` is **local-only** (gitignored). Cloud Run uses its own env vars/secrets.
- Prefer Secret Manager for sensitive values (private keys, OAuth client secret, NextAuth secret).
- Use `--update-env-vars` / `--update-secrets` for small changes. Use `--set-*` only when you intend to replace the full set.

### Update a few env vars (safe, non-destructive)

```bash
gcloud run services update outreach-tracker \
  --project company-tracker-485803 \
  --region us-central1 \
  --update-env-vars "SPREADSHEET_ID_1=...,SPREADSHEET_ID_2=...,GOOGLE_OAUTH_CLIENT_ID=..." \
  --quiet
```

### Update secret bindings (safe, non-destructive)

```bash
gcloud run services update outreach-tracker \
  --project company-tracker-485803 \
  --region us-central1 \
  --update-secrets "GOOGLE_PRIVATE_KEY=your-secret:latest,GOOGLE_OAUTH_CLIENT_SECRET=your-secret:latest,NEXTAUTH_SECRET=your-secret:latest" \
  --quiet
```

## Maintenance mode (disable writes)

Enable:

```bash
gcloud run services update outreach-tracker \
  --project company-tracker-485803 \
  --region us-central1 \
  --update-env-vars MAINTENANCE_MODE=1 \
  --quiet
```

Disable:

```bash
gcloud run services update outreach-tracker \
  --project company-tracker-485803 \
  --region us-central1 \
  --update-env-vars MAINTENANCE_MODE=0 \
  --quiet
```

Remove entirely:

```bash
gcloud run services update outreach-tracker \
  --project company-tracker-485803 \
  --region us-central1 \
  --remove-env-vars MAINTENANCE_MODE \
  --quiet
```

## Troubleshooting

### Build fails with buildpacks (wrong build context)

Run deploy from `outreach-tracker/` (or use the script):

```bash
cd outreach-tracker
gcloud run deploy outreach-tracker \
  --source . \
  --project company-tracker-485803 \
  --region us-central1 \
  --allow-unauthenticated \
  --min-instances 1
```

### Google sign-in redirects to localhost

Set `NEXTAUTH_URL` to the Cloud Run service URL:

```bash
SERVICE_URL=$(gcloud run services describe outreach-tracker \
  --project company-tracker-485803 \
  --region us-central1 \
  --format='value(status.url)')

gcloud run services update outreach-tracker \
  --project company-tracker-485803 \
  --region us-central1 \
  --update-env-vars "NEXTAUTH_URL=${SERVICE_URL}" \
  --quiet
```

Also ensure your Google OAuth client has the redirect URI:
`https://YOUR-SERVICE-URL/api/auth/callback/google`
