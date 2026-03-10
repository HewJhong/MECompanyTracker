# Deployment Checklist

Quick checklist for deploying SwiftInvite to Google Cloud Run.

---

## Pre-Deployment

### ✅ Prerequisites
- [ ] Google Cloud account created
- [ ] Billing enabled on Google Cloud project
- [ ] `gcloud` CLI installed (`brew install --cask google-cloud-sdk`)
- [ ] Google OAuth credentials created
  - [ ] OAuth consent screen configured (External, Testing)
  - [ ] Web application OAuth Client ID created
  - [ ] Client ID and Secret saved

### ✅ Local Files Ready
- [ ] `Dockerfile` created
- [ ] `.dockerignore` created
- [ ] `requirements.txt` has all dependencies
- [ ] Code tested locally with `LOCAL_DEV_MODE=True`

---

## Deployment Steps

### 1. Initialize gcloud
```bash
- [ ] gcloud auth login
- [ ] gcloud config set project YOUR_PROJECT_ID
- [ ] gcloud services enable run.googleapis.com
- [ ] gcloud services enable cloudbuild.googleapis.com
```

### 2. Deploy to Cloud Run
```bash
- [ ] gcloud run deploy swiftinvite --source . --region us-central1 --allow-unauthenticated
- [ ] Wait for build to complete (~5-10 minutes)
- [ ] Save the deployed URL
```

### 3. Configure Environment Variables
```bash
- [ ] Get service URL: gcloud run services describe swiftinvite --region us-central1 --format='value(status.url)'
- [ ] Generate SESSION_KEY: python3 -c "import secrets; print(secrets.token_urlsafe(32))"
- [ ] Generate ENCRYPTION_KEY: python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
- [ ] Update service with environment variables (see deployment guide)
- [ ] Set LOCAL_DEV_MODE=False
- [ ] Set DATABASE_URL=sqlite:///roster.db
```

### 4. Update OAuth Redirect URIs
```bash
- [ ] Go to Google Cloud Console → APIs & Services → Credentials
- [ ] Click on your OAuth 2.0 Client ID
- [ ] Add redirect URI: https://YOUR-URL/auth/callback
- [ ] Save changes
```

---

## Post-Deployment Testing

### 5. Test Your Deployment
- [ ] Visit production URL
- [ ] Click "Sign in with Google"
- [ ] Handle "unverified app" warning (Click Advanced → Go to SwiftInvite)
- [ ] Successfully log in
- [ ] Upload test CSV roster
- [ ] View departments
- [ ] Create test meeting
- [ ] Logout and re-login

### 6. Add Test Users
- [ ] Go to Google OAuth consent screen
- [ ] Add all 50 expected users to test users list
- [ ] Send onboarding instructions to users

---

## Verification

### ✅ Deployment Successful If:
- [ ] App loads at production URL
- [ ] OAuth login works
- [ ] Can upload CSV
- [ ] Can create meetings
- [ ] User data persists after logout/login
- [ ] Multiple users can log in

### ✅ Environment Configured If:
- [ ] `LOCAL_DEV_MODE=False` (check Cloud Run console)
- [ ] `DEBUG=False`
- [ ] OAuth credentials set
- [ ] Security keys set
- [ ] Database URL set to SQLite

### ✅ Security & Session Isolation (CRITICAL!)
**Test for session isolation to prevent users from seeing each other's data:**

- [ ] Open the app in two different browsers (e.g., Chrome and Firefox) or incognito windows
- [ ] Log in as User A in Browser 1
- [ ] Log in as User B in Browser 2
- [ ] **Verify each browser shows the correct user's email/name** (not the other user's)
- [ ] Refresh both browsers and verify sessions remain isolated
- [ ] Check response headers (DevTools → Network → Select any page → Headers tab):
  - [ ] `Cache-Control: no-store, no-cache, must-revalidate, private, max-age=0`
  - [ ] `Vary: Cookie`
  - [ ] `X-Frame-Options: DENY`
  - [ ] `X-Content-Type-Options: nosniff`

**⚠️ CRITICAL:** If users see each other's sessions, this indicates a caching issue that MUST be fixed before production use. This can happen if:
- Cache-Control headers are missing (pages get cached by Cloud Run/browser/proxy)
- Session middleware is not configured correctly
- Sessions are not being regenerated on login

**Fix if sessions are leaking:**
1. Verify `add_security_headers` middleware is present in `main.py`
2. Check that session regeneration happens in the OAuth callback
3. All users must log out and log back in after the fix is deployed
4. Clear browser cache if issues persist

---

## Troubleshooting

### If OAuth Fails:
- [ ] Check redirect URI matches exactly in Google Console
- [ ] Verify CLIENT_ID and CLIENT_SECRET are correct
- [ ] Check user is added to test users list

### If Build Fails:
- [ ] Check build logs: `gcloud builds list --limit=5`
- [ ] Verify Dockerfile syntax
- [ ] Check requirements.txt is complete

### If App Crashes:
- [ ] View logs: `gcloud run services logs tail swiftinvite --region us-central1`
- [ ] Check environment variables are set
- [ ] Verify LOCAL_DEV_MODE=False

### If Sessions Are Leaking (Users See Other Users' Data):
**Symptoms:**
- User A logs in but sees User B's name/email
- Different users see the same dashboard data
- Sessions appear to be shared across users

**Root Cause:**
- Missing cache-control headers allow caching of authenticated pages
- HTTP responses with user data are cached by Cloud Run edge cache, browser, or proxies

**Solution:**
1. Verify security middleware is present in `main.py`:
   ```python
   @app.middleware("http")
   async def add_security_headers(request: Request, call_next):
       response = await call_next(request)
       if "text/html" in response.headers.get("content-type", ""):
           response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private, max-age=0"
           response.headers["Vary"] = "Cookie"
   ```

2. Verify session regeneration in OAuth callback (`main.py`):
   ```python
   # In google_callback function
   request.session.clear()  # Clear old session
   request.session['user_id'] = user.id  # Set new session data
   ```

3. Check response headers using curl:
   ```bash
   curl -I https://your-app-url.run.app/
   # Should see: Cache-Control: no-store, no-cache...
   ```

4. Force all users to log out and log back in
5. Clear browser cache completely (or use incognito mode for testing)

### If Calendar Operations Fail:
**Error:** `create_calendar_event() missing 1 required positional argument: 'access_token'`

**Solution:**
- Ensure all calendar endpoints get user tokens: `user_tokens = await auth.get_user_tokens(http_request)`
- Pass access_token to Google Calendar service: `access_token=user_tokens['access_token']`
- Affected endpoints:
  - `/api/create-invite`
  - `/api/create-single-invite`
  - `/api/meetings/{id}` (PUT/DELETE)
  - `/api/test-calendar`

---

## Monitoring

### Regular Checks:
- [ ] Monitor usage: Cloud Run console
- [ ] Check costs: Billing console (should be $0)
- [ ] Review logs for errors
- [ ] Test OAuth flow periodically

---

## Next Steps (Optional)

### If You Need Better Persistence:
- [ ] Consider migrating to Cloud SQL
- [ ] See "Advanced: Cloud SQL" section in deployment guide
- [ ] Budget ~$7-10/month

### If Scaling Up:
- [ ] Add more test users (up to 100)
- [ ] Consider OAuth verification (if going public)
- [ ] Set up monitoring alerts
- [ ] Configure custom domain

---

**Total Deployment Time:** ~30-40 minutes  
**Expected Monthly Cost:** $0 (free tier)  
**User Capacity:** 50-100 users comfortably

Good luck! 🚀
