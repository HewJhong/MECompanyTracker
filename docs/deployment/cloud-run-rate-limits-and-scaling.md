# Cloud Run: Where to Check Rate Limits and Scaling

## Why instances go to 0 after a deploy

Each **new revision** gets its own scaling settings. If your deploy command does **not** include `--min-instances`, the new revision defaults to **min-instances 0**. Traffic then moves to that revision, so the service scales to zero again even if you had set min 3 in the Console on an older revision.

**Fix:** Include `--min-instances 1` (or `3`) in your deploy command so every new revision keeps a minimum number of instances. See `latest_deploy_command.md`.

---

## Where to check limits and scaling

### 1. **Scaling (min/max instances) – Cloud Run Console**

- **Console:** [Cloud Run](https://console.cloud.google.com/run) → select **outreach-tracker** → **Revisions**.
- Click the **revision that has 100% traffic**.
- Check **Minimum number of instances** and **Maximum number of instances**.
- To change: **Edit & deploy new revision** → **Container(s)** → **Scaling** (or **Minimum instances** / **Maximum instances**).

Or with gcloud:

```bash
gcloud run services describe outreach-tracker \
  --region us-central1 \
  --format='yaml(spec.template.metadata.annotations,spec.template.spec.containerConcurrency)'
```

For min/max on the current template:

```bash
gcloud run revisions describe REVISION_NAME --region us-central1 --format="yaml(spec.containerConcurrency,metadata.annotations)"
```

(Min instances are often in `metadata.annotations` like `autoscaling.knative.dev/minScale`.)

### 2. **Quotas (project/region limits) – IAM & Admin**

These cap how many instances and resources Cloud Run can use. If you hit a quota, scaling can stop or fail.

- **Console:** [IAM & Admin → Quotas](https://console.cloud.google.com/iam-admin/quotas).
- Filter by:
  - **Service:** “Cloud Run API” or “Cloud Run Admin API”.
  - **Metric:** e.g. “Max number of instances”, “CPU”, “Memory”.
- **Region:** e.g. `us-central1`.

Adjust or request increases there if you see usage at the limit.

### 3. **Per-revision settings (concurrency, CPU)**

- **Console:** Cloud Run → **outreach-tracker** → **Edit & deploy new revision**.
- **Container(s)** → **Resources**: CPU allocation (always allocated vs only during request), memory, CPU.
- **Scaling**: Min/max instances, request timeout, concurrency.

---

## Summary

| What you want to check | Where |
|------------------------|--------|
| Min/max instances for the revision serving traffic | Cloud Run → service → Revisions → revision with 100% traffic |
| Change min/max for new revisions | Add `--min-instances` / `--max-instances` to deploy, or set in “Edit & deploy” |
| Project/region limits (why scaling might stop) | IAM & Admin → Quotas, filter Cloud Run + region |
| Concurrency, CPU, timeout | Cloud Run → service → Edit & deploy new revision → Container / Scaling |

Keeping **min-instances in the deploy command** (e.g. `--min-instances 1`) ensures new revisions don’t reset to 0 and cause the “rate exceeded” / 429 behavior.
