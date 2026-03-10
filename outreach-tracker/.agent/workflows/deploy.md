---
description: How to deploy the Outreach Tracker to Google Cloud Run
---

# Outreach Tracker Deployment Workflow

This workflow describes how to push updates to the Outreach Tracker on Google Cloud Run.

## Quick Update

To deploy your latest local changes:

```bash
gcloud run deploy outreach-tracker \
  --source . \
  --project company-tracker-485803 \
  --region us-central1 \
  --allow-unauthenticated
```

## Detailed Documentation

For a full breakdown of the deployment architecture, security, and configuration, refer to these guides:

- [Cloud Run Deployment Guide](file:///Users/jinhong/Documents/My Projects/ME Company Tracker/docs/deployment/CLOUD_RUN_DEPLOYMENT.md)
- [Outreach Tracker Deployment Plan](file:///Users/jinhong/Documents/My Projects/ME Company Tracker/docs/deployment/outreach_tracker_deployment_plan.md)
- [Security Best Practices](file:///Users/jinhong/Documents/My Projects/ME Company Tracker/docs/deployment/SECURITY_BEST_PRACTICES.md)
