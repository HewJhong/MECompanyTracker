# Google Cloud Run Deployment Guide

Complete guide to deploying SwiftInvite on Google Cloud Run with SQLite (free tier).

## Overview

This guide walks you through deploying SwiftInvite to Google Cloud Run using **SQLite** as the database. This is the simplest, fastest, and most cost-effective approach for small to medium deployments (up to ~100 users).

**Total deployment time:** ~20-30 minutes  
**Expected cost:** $0/month (within free tier)

### What You'll Deploy

- ✅ SwiftInvite web application on Cloud Run
- ✅ SQLite database (built into container)
- ✅ Multi-user OAuth authentication
- ✅ HTTPS enabled (automatic)
- ✅ Auto-scaling (0 to N instances)

### What's Covered

1. **Quick Deployment (5 Steps)** - Get your app running in ~20 minutes
2. **Environment Variables Setup** - Configure OAuth and secrets
3. **OAuth Setup** - Add production URL to Google OAuth
4. **Testing** - Verify your deployment works
5. **Advanced: Cloud SQL** - Optional upgrade to PostgreSQL (if needed later)

### Related Guides

- 📘 **[OAuth Deployment Guide](./OAUTH_DEPLOYMENT_GUIDE.md)** - Step-by-step guide to configure OAuth correctly from the start (prevents session problems, state mismatch, middleware issues)

---

## Prerequisites

- ✅ Google Cloud account (with **billing enabled**)
- ✅ `gcloud` CLI installed ([Install Guide](https://cloud.google.com/sdk/docs/install))
- ✅ Google OAuth credentials configured ([OAuth Setup Guide](../guides/OAUTH_SETUP_GUIDE.md))
- ✅ Docker installed (optional, Cloud Build will handle it)

**Important:** Billing must be enabled even though you'll stay within the free tier.

---

## Database Choice

**Choose your database before deploying:**

### ✅ Option A: SQLite (Recommended to Start)

**Use this if:**
- Small to medium user base (< 100 users)
- Low concurrent usage (< 10 simultaneous users)
- Want to deploy quickly and for free
- Don't need data persistence across container restarts

**Pros:**
- ✅ Completely free
- ✅ No additional setup
- ✅ Simpler deployment
- ✅ Good enough for most internal tools

**Cons:**
- ⚠️ Data may be lost on container restart (rare)
- ⚠️ Not ideal for high-traffic apps

**Cost:** $0/month

---

### Option B: Cloud SQL PostgreSQL (Production)

**Use this if:**
- Need guaranteed data persistence
- High traffic (> 100 users)
- Want automatic backups
- Have budget for managed database

**Pros:**
- ✅ Data persists across restarts
- ✅ Automatic backups
- ✅ Better for scaling
- ✅ Production-grade reliability

**Cons:**
- ❌ Costs ~$7-10/month (smallest instance)
- ❌ More complex setup
- ❌ Requires additional configuration

**Cost:** ~$7-10/month

---

**💡 Recommendation:** Start with SQLite. You can migrate to Cloud SQL later if needed. This guide focuses on SQLite deployment.

---

## Quick Deployment with SQLite (5 Steps)

### Step 1: Prepare Your Project

```bash
cd "/Users/jinhong/Documents/My Projects/SwiftInvite"

# Ensure all dependencies are in requirements.txt
cat requirements.txt

# Should include all these:
# - fastapi, uvicorn, sqlalchemy, psycopg2-binary
# - authlib, httpx, cryptography, python-dotenv
# - google-api-python-client, google-auth-oauthlib
```

### Step 2: Create Dockerfile

```bash
cat > Dockerfile << 'EOF'
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Run database migrations on startup
RUN chmod +x init_db.py

# Expose port (Cloud Run will set $PORT)
EXPOSE 8080

# Start command
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}
EOF
```

### Step 3: Create .dockerignore

```bash
cat > .dockerignore << 'EOF'
# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
venv/
env/
ENV/

# Environment
.env
.env.local
.env.*.local

# Database
*.db
roster.db
alembic_version

# OAuth tokens
token.json
client_secret.json

# Git
.git/
.gitignore

# IDE
.vscode/
.idea/
*.swp
*.swo

# Docs
*.md
docs/
EOF
```

### Step 4: Initialize gcloud

```bash
# Login to Google Cloud
gcloud auth login

# Set your project ID
gcloud config set project swiftinvite

# Enable required APIs (for SQLite deployment)
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com

# Optional: Enable these only if using Secret Manager or Cloud SQL
# gcloud services enable secretmanager.googleapis.com
# gcloud services enable sqladmin.googleapis.com
```

### Step 5: Deploy to Cloud Run

```bash
# Deploy (this builds and deploys in one command)
gcloud run deploy swiftinvite \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "DEBUG=False"

# You'll be prompted:
# - Allow unauthenticated invocations? Y
# - Service will be deployed to Cloud Run
```

After deployment, you'll get a URL like: `https://swiftinvite-xxxxx-uc.a.run.app`

---

## Setting Up Environment Variables (SQLite)

### Configure Your Deployment

```bash
# Get your deployed service URL
SERVICE_URL=$(gcloud run services describe swiftinvite --region us-central1 --format='value(status.url)')
echo "Service URL: $SERVICE_URL"

# Generate security keys locally
SESSION_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
ENCRYPTION_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")

# Update environment variables with your OAuth credentials
gcloud run services update swiftinvite \
  --region us-central1 \
  --set-env-vars "DEBUG=False,LOCAL_DEV_MODE=False" \
  --set-env-vars "GOOGLE_CLIENT_ID=YOUR_CLIENT_ID" \
  --set-env-vars "GOOGLE_CLIENT_SECRET=YOUR_CLIENT_SECRET" \
  --set-env-vars "REDIRECT_URI=${SERVICE_URL}/auth/callback" \
  --set-env-vars "SESSION_SECRET_KEY=${SESSION_KEY}" \
  --set-env-vars "ENCRYPTION_KEY=${ENCRYPTION_KEY}" \
  --set-env-vars "DATABASE_URL=sqlite:///roster.db"
```

**⚠️ Important:** Replace the placeholders:
- `YOUR_CLIENT_ID` → Your Google OAuth Client ID (e.g., `xxxxx.apps.googleusercontent.com`)
- `YOUR_CLIENT_SECRET` → Your Google OAuth Client Secret (e.g., `GOCSPX-xxxxx`)

**Example with actual values:**
```bash
gcloud run services update swiftinvite \
  --region us-central1 \
  --set-env-vars "DEBUG=False,LOCAL_DEV_MODE=False" \
  --set-env-vars "GOOGLE_CLIENT_ID=123456789.apps.googleusercontent.com" \
  --set-env-vars "GOOGLE_CLIENT_SECRET=GOCSPX-your-actual-secret-here" \
  --set-env-vars "REDIRECT_URI=${SERVICE_URL}/auth/callback" \
  --set-env-vars "SESSION_SECRET_KEY=${SESSION_KEY}" \
  --set-env-vars "ENCRYPTION_KEY=${ENCRYPTION_KEY}" \
  --set-env-vars "DATABASE_URL=sqlite:///roster.db"
```

---

## Update OAuth Redirect URIs

After deployment, you need to add your production URL to Google OAuth:

1. **Go to Google Cloud Console** → APIs & Services → Credentials
2. **Click on your OAuth 2.0 Client ID**
3. **Add Authorized redirect URI:**
   ```
   https://swiftinvite-xxxxx-uc.a.run.app/auth/callback
   ```
   (Replace with your actual Cloud Run URL)
4. **Click Save**

---

## Security Verification (CRITICAL!)

**⚠️ IMPORTANT:** Before allowing users to access the application, you MUST verify session isolation to prevent users from seeing each other's data.

### Session Isolation Test

This test ensures that user sessions are properly isolated and not being cached:

```bash
# 1. Get your deployment URL
SERVICE_URL=$(gcloud run services describe swiftinvite --region us-central1 --format='value(status.url)')
echo "Service URL: $SERVICE_URL"

# 2. Check that cache-control headers are present
curl -I $SERVICE_URL | grep -i cache-control
# Expected output: Cache-Control: no-store, no-cache, must-revalidate, private, max-age=0

curl -I $SERVICE_URL | grep -i vary
# Expected output: Vary: Cookie
```

### Multi-User Session Test

**CRITICAL:** Perform this test with two different browsers or devices:

1. **Open Browser 1** (e.g., Chrome)
   - Navigate to your production URL
   - Log in as User A
   - Note the user's email/name displayed in the header

2. **Open Browser 2** (e.g., Firefox or Chrome Incognito)
   - Navigate to the same production URL
   - Log in as User B (different user)
   - Note the user's email/name displayed

3. **Verify Isolation**
   - Browser 1 should ONLY show User A's data
   - Browser 2 should ONLY show User B's data
   - Refresh both browsers - sessions should remain separate
   - If either browser shows the wrong user's data, **DO NOT DEPLOY TO PRODUCTION**

### Expected Security Headers

Check the response headers in browser DevTools (Network tab → Select any HTML page → Headers):

```
Cache-Control: no-store, no-cache, must-revalidate, private, max-age=0
Pragma: no-cache
Expires: 0
Vary: Cookie
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
```

**If any of these headers are missing, your application has a security vulnerability.**

### What If Sessions Are Leaking?

**Symptoms:**
- Users see other users' names/emails
- Dashboard shows wrong user's data
- Multiple users appear to share the same session

**Root Cause:**
- Missing `Cache-Control` headers cause authenticated pages to be cached
- Cloud Run edge cache, browser cache, or proxies serve cached pages to different users
- This is a **critical security vulnerability** that exposes user data

**How This Was Fixed:**
The application includes security middleware that:
1. Adds strict no-cache headers to all HTML responses
2. Regenerates sessions on login to prevent session fixation
3. Adds security headers to prevent other attacks

**If you see this issue:**
1. Ensure `add_security_headers` middleware is present in `main.py`
2. Redeploy the application
3. Force all users to log out
4. Clear all caches (browser, proxy, CDN)
5. Test again with the multi-user session test above

---

## Testing Your Deployment

### 1. Visit Your Production URL

```bash
# Get your URL
gcloud run services describe swiftinvite --region us-central1 --format='value(status.url)'
```

Open the URL in your browser.

### 2. Test OAuth Flow

1. Click "Sign in with Google"
2. You'll see "This app isn't verified" warning (expected for testing)
3. Click "Advanced" → "Go to SwiftInvite (unsafe)"
4. Grant permissions
5. You should be redirected to the dashboard

**💡 OAuth Setup:** For detailed OAuth configuration and best practices, see the [OAuth Deployment Guide](./OAUTH_DEPLOYMENT_GUIDE.md) to ensure correct setup from the start.

### 3. Test Core Features

- ✅ Upload CSV roster
- ✅ View departments
- ✅ Create meeting invite (form should work, but Calendar API call will work if OAuth is configured)
- ✅ Logout and re-login

---

## Deployment Complete! 🎉

Your SwiftInvite app is now live with:
- ✅ Cloud Run deployment
- ✅ SQLite database
- ✅ Multi-user OAuth authentication
- ✅ HTTPS enabled
- ✅ Free tier hosting

### Next Steps

1. **Add all 50 test users** to Google OAuth consent screen
2. **Share the URL** with your team
3. **Monitor usage** in Cloud Run console
4. **Consider Cloud SQL** if you need better persistence (see Advanced section below)

---

## Advanced: Cloud SQL PostgreSQL (Optional)

**⚠️ This section is OPTIONAL.** Only follow these steps if you need Cloud SQL instead of SQLite.

**When to use Cloud SQL:**
- You experience data loss after container restarts
- You have >100 concurrent users
- You need guaranteed persistence
- You have budget for ~$7-10/month

**If using SQLite (recommended), skip this entire section.**

---

### Step 1: Enable Cloud SQL API

```bash
# Enable Cloud SQL API
gcloud services enable sqladmin.googleapis.com
```

### Step 2: Create PostgreSQL Instance

```bash
# Create PostgreSQL instance (smallest tier: ~$7-10/month)
gcloud sql instances create swiftinvite-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=us-central1 \
  --root-password=YOUR_SECURE_PASSWORD     # ← Replace with a secure password

# Create database
gcloud sql databases create swiftinvite \
  --instance=swiftinvite-db

# Create user
gcloud sql users create swiftinvite_user \
  --instance=swiftinvite-db \
  --password=YOUR_USER_PASSWORD             # ← Replace with a secure password

# Get connection name
CONNECTION_NAME=$(gcloud sql instances describe swiftinvite-db --format='value(connectionName)')
echo "Connection name: $CONNECTION_NAME"
```

### Step 3: Connect Cloud Run to Cloud SQL

```bash
# Update Cloud Run service to connect to Cloud SQL
gcloud run services update swiftinvite \
  --region us-central1 \
  --add-cloudsql-instances $CONNECTION_NAME \
  --update-env-vars "DATABASE_URL=postgresql://swiftinvite_user:YOUR_USER_PASSWORD@/swiftinvite?host=/cloudsql/$CONNECTION_NAME"
# ← Replace YOUR_USER_PASSWORD with the password you set above
```

**Note:** After switching to Cloud SQL, your data will persist across container restarts.

---

## Monitoring & Logs

### View Logs
```bash
# Tail logs in real-time
gcloud run services logs tail swiftinvite --region us-central1

# View logs in console
gcloud run services logs read swiftinvite --region us-central1 --limit=50
```

### View Service Info
```bash
# Get service details
gcloud run services describe swiftinvite --region us-central1

# Get service URL
gcloud run services describe swiftinvite --region us-central1 --format='value(status.url)'
```

---

## Continuous Deployment (Optional)

### Deploy from GitHub

1. Connect your repository:
   ```bash
   gcloud run deploy swiftinvite \
     --source https://github.com/YOUR_USERNAME/SwiftInvite \
     --region us-central1 \
     --allow-unauthenticated
   ```

2. Set up Cloud Build trigger:
   - Go to Cloud Build → Triggers
   - Connect repository
   - Create trigger on `main` branch push
   - Build configuration: Dockerfile

---

## Cost Optimization

### Free Tier Limits (as of 2024)

Cloud Run free tier includes:
- 2 million requests/month
- 360,000 GB-seconds of memory
- 180,000 vCPU-seconds
- 1 GB network egress from North America

**For 50 users with low usage**: You'll likely stay within free tier! 🎉

### Tips to Stay Free

1. **Use minimum resources:**
   ```bash
   gcloud run services update swiftinvite \
     --region us-central1 \
     --memory 512Mi \
     --cpu 1 \
     --max-instances 3 \
     --concurrency 80
   ```

2. **Set minimum instances to 0** (default):
   - Service scales to zero when not in use
   - First request will be slow (cold start)

3. **Stick with SQLite:**
   - SQLite is completely free
   - No additional database costs
   - Cloud SQL costs ~$7-10/month even on smallest tier

---

## Troubleshooting

### "Service not found"
```bash
# List all services
gcloud run services list --region us-central1
```

### "Permission denied"
```bash
# Grant yourself owner role
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="user:YOUR_EMAIL" \
  --role="roles/owner"
```

### "Build failed"
```bash
# Check build logs
gcloud builds list --limit=5

# View specific build
gcloud builds log BUILD_ID
```

### Database connection issues
```bash
# Test Cloud SQL connection
gcloud sql connect swiftinvite-db --user=swiftinvite_user

# Check Cloud Run service account permissions
gcloud projects get-iam-policy PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:*compute*"
```

---

## Rollback

If something goes wrong:

```bash
# List revisions
gcloud run revisions list --service swiftinvite --region us-central1

# Rollback to previous revision
gcloud run services update-traffic swiftinvite \
  --region us-central1 \
  --to-revisions REVISION_NAME=100
```

---

## Delete Everything (Cleanup)

```bash
# Delete Cloud Run service
gcloud run services delete swiftinvite --region us-central1

# Delete Cloud SQL instance
gcloud sql instances delete swiftinvite-db

# Delete secrets
gcloud secrets delete google-client-secret
gcloud secrets delete session-secret-key
gcloud secrets delete encryption-key
```

---

## Quick Commands Reference

```bash
# Deploy/Update
gcloud run deploy swiftinvite --source . --region us-central1

# View URL
gcloud run services describe swiftinvite --region us-central1 --format='value(status.url)'

# View logs
gcloud run services logs tail swiftinvite --region us-central1

# Update env vars
gcloud run services update swiftinvite --region us-central1 --set-env-vars "KEY=VALUE"

# View all environment variables
gcloud run services describe swiftinvite --region us-central1 --format='value(spec.template.spec.containers[0].env)'
```

---

**Your SwiftInvite app is now live on Google Cloud Run!** 🚀
