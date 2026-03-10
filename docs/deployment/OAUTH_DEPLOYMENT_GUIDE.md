# OAuth Deployment Guide for Google Cloud Run

**Complete step-by-step guide to deploying FastAPI/Starlette OAuth applications to Google Cloud Run WITHOUT errors.**

This guide ensures you configure everything correctly from the start to avoid OAuth state mismatch, session loss, and authentication failures.

---

## Prerequisites

- ✅ Google Cloud account with billing enabled
- ✅ `gcloud` CLI installed and configured
- ✅ Google OAuth credentials created
- ✅ FastAPI/Starlette application with OAuth

---

## The Four Golden Rules

Follow these rules **exactly** to avoid OAuth issues on Cloud Run:

### 1. Middleware Order (CRITICAL)

In FastAPI/Starlette, middleware runs in **reverse order**. Add SessionMiddleware BEFORE ProxyHeadersMiddleware.

**✅ CORRECT ORDER:**

```python
from fastapi import FastAPI
from starlette.middleware.sessions import SessionMiddleware
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

app = FastAPI()

# Add SessionMiddleware FIRST (runs SECOND in request chain)
app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET_KEY,
    session_cookie="your_app_session",
    max_age=86400,
    same_site="lax",
    https_only=True,
    path="/",
    domain=None
)

# Add ProxyHeadersMiddleware SECOND (runs FIRST in request chain)
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")
```

**❌ WRONG ORDER (causes session loss):**

```python
# DON'T DO THIS
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")  # Added first
app.add_middleware(SessionMiddleware, ...)  # Added second - WRONG!
```

**Why this matters:** ProxyHeadersMiddleware must run BEFORE SessionMiddleware to detect HTTPS from Cloud Run's X-Forwarded-Proto header. Otherwise, secure cookies won't be set correctly.

---

### 2. Let OAuth Library Handle State

Never manually manage OAuth state when using libraries like Authlib.

**✅ CORRECT - Let Authlib handle state:**

```python
@app.get("/auth/google")
async def google_login(request: Request):
    # Authlib automatically generates and stores state
    return await oauth.google.authorize_redirect(
        request,
        redirect_uri=REDIRECT_URI
    )

@app.get("/auth/callback")
async def google_callback(request: Request):
    # Authlib automatically validates state
    token = await oauth.google.authorize_access_token(request)
    # Continue with user info...
```

**❌ WRONG - Manual state management:**

```python
# DON'T DO THIS
@app.get("/auth/google")
async def google_login(request: Request):
    state = secrets.token_urlsafe(32)  # Manual state
    request.session['oauth_state'] = state  # Manual storage
    return await oauth.google.authorize_redirect(request, state=state)
```

**Why this matters:** Manual state conflicts with library's internal state management, causing mismatches.

---

### 3. Session Cookie Configuration

Use these EXACT session cookie settings for Cloud Run:

**✅ CORRECT Configuration:**

```python
app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET_KEY,      # From environment variable
    session_cookie="your_app_session",   # Unique name for your app
    max_age=86400,                       # 24 hours in seconds
    same_site="lax",                     # REQUIRED for OAuth (allows GET redirects)
    https_only=True,                     # REQUIRED in production
    path="/",                            # Ensures cookie sent to all routes
    domain=None                          # Let browser determine domain
)
```

**❌ WRONG Settings:**

```python
# DON'T USE THESE
same_site="strict"  # ❌ Blocks OAuth redirects
same_site="none"    # ❌ Requires extra CORS config
https_only=False    # ❌ Insecure in production
domain="example.com"  # ❌ Won't work with Cloud Run URLs
```

**Parameter Breakdown:**

| Parameter | Value | Why |
|-----------|-------|-----|
| `same_site` | `"lax"` | Allows cookies on OAuth GET redirects from Google |
| `https_only` | `True` | Secure cookies required for HTTPS (Cloud Run) |
| `path` | `"/"` | Cookie sent to all routes including `/auth/callback` |
| `domain` | `None` | Let browser set domain (works with Cloud Run URLs) |

---

### 4. Use ONE Cloud Run URL Consistently

Google Cloud Run provides two URL formats. Use the **long URL** everywhere.

**✅ CORRECT - Long URL (project-based):**
```
https://your-service-479012214712.us-central1.run.app
```

**❌ WRONG - Short URL (hash-based):**
```
https://your-service-abc123xyz-uc.a.run.app
```

**Get the correct URL:**

```bash
SERVICE_URL=$(gcloud run services describe your-service \
  --region us-central1 \
  --format='value(status.url)')
echo $SERVICE_URL
```

**Use this URL in THREE places:**

1. **Cloud Run Environment Variable:**
   ```bash
   gcloud run services update your-service \
     --region us-central1 \
     --set-env-vars "REDIRECT_URI=${SERVICE_URL}/auth/callback"
   ```

2. **Google OAuth Console:**
   - Go to: https://console.cloud.google.com/apis/credentials
   - Add: `https://your-service-479012214712.us-central1.run.app/auth/callback`

3. **NEVER mix short and long URLs** - pick one format and use it everywhere

---

## Step-by-Step Deployment

### Step 1: Configure Local Development

Create `config.py` with environment detection:

```python
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# OAuth Configuration
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
REDIRECT_URI = os.getenv("REDIRECT_URI", "http://localhost:8000/auth/callback")

# Security Keys
SESSION_SECRET_KEY = os.getenv("SESSION_SECRET_KEY")
if not SESSION_SECRET_KEY:
    import secrets
    SESSION_SECRET_KEY = secrets.token_urlsafe(32)
    print("⚠️ SESSION_SECRET_KEY not set, using temporary key")

ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY")
if not ENCRYPTION_KEY:
    from cryptography.fernet import Fernet
    ENCRYPTION_KEY = Fernet.generate_key().decode()
    print("⚠️ ENCRYPTION_KEY not set, using temporary key")

# Environment Detection
LOCAL_DEV_MODE = os.getenv("LOCAL_DEV_MODE", "False").lower() == "true"
DEBUG = os.getenv("DEBUG", "True").lower() == "true"
```

---

### Step 2: Configure Middleware (CORRECT ORDER)

In `main.py`:

```python
from fastapi import FastAPI
from starlette.middleware.sessions import SessionMiddleware
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware
from config import SESSION_SECRET_KEY, LOCAL_DEV_MODE

app = FastAPI()

# STEP 1: Add SessionMiddleware FIRST
app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET_KEY,
    session_cookie="swiftinvite_session",  # Change to your app name
    max_age=86400,
    same_site="lax",
    https_only=not LOCAL_DEV_MODE,  # False in dev, True in prod
    path="/",
    domain=None
)

# STEP 2: Add ProxyHeadersMiddleware SECOND (production only)
if not LOCAL_DEV_MODE:
    app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")
```

**Critical:** Do NOT change this order!

---

### Step 3: Configure OAuth Client

In `auth.py`:

```python
from authlib.integrations.starlette_client import OAuth
from config import GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI

oauth = OAuth()
oauth.register(
    name='google',
    client_id=GOOGLE_CLIENT_ID,
    client_secret=GOOGLE_CLIENT_SECRET,
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={
        'scope': 'openid email profile'
    }
    # DO NOT set redirect_uri here
)
```

---

### Step 4: Implement OAuth Routes (Let Authlib Handle State)

In `main.py`:

```python
from fastapi import Request
from fastapi.responses import RedirectResponse
from config import REDIRECT_URI
import auth

@app.get("/auth/google")
async def google_login(request: Request):
    """Initiate Google OAuth - Authlib handles state automatically"""
    return await auth.oauth.google.authorize_redirect(
        request,
        redirect_uri=REDIRECT_URI  # Pass REDIRECT_URI here, not in registration
    )

@app.get("/auth/callback")
async def google_callback(request: Request):
    """Handle OAuth callback - Authlib validates state automatically"""
    try:
        # Authlib validates state here - will raise error if mismatch
        token = await auth.oauth.google.authorize_access_token(request)
        
        user_info = token.get('userinfo')
        if not user_info:
            raise HTTPException(400, "Failed to get user info")
        
        # Store user in session
        request.session['user'] = {
            'email': user_info['email'],
            'name': user_info['name']
        }
        
        return RedirectResponse(url='/')
    except Exception as e:
        print(f"❌ OAuth callback error: {e}")
        raise HTTPException(400, f"Authentication failed: {str(e)}")
```

---

### Step 5: Deploy to Cloud Run

```bash
# Navigate to project directory
cd "/path/to/your/project"

# Deploy
gcloud run deploy your-service \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

---

### Step 6: Configure Environment Variables

**Get service URL (long format):**

```bash
SERVICE_URL=$(gcloud run services describe your-service \
  --region us-central1 \
  --format='value(status.url)')
echo "Service URL: $SERVICE_URL"
```

**Generate security keys:**

```bash
SESSION_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
ENCRYPTION_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
```

**Set environment variables:**

```bash
gcloud run services update your-service \
  --region us-central1 \
  --set-env-vars "DEBUG=False" \
  --set-env-vars "LOCAL_DEV_MODE=False" \
  --set-env-vars "GOOGLE_CLIENT_ID=your-id.apps.googleusercontent.com" \
  --set-env-vars "GOOGLE_CLIENT_SECRET=GOCSPX-your-secret" \
  --set-env-vars "REDIRECT_URI=${SERVICE_URL}/auth/callback" \
  --set-env-vars "SESSION_SECRET_KEY=${SESSION_KEY}" \
  --set-env-vars "ENCRYPTION_KEY=${ENCRYPTION_KEY}"
```

**Verify environment variables:**

```bash
gcloud run services describe your-service \
  --region us-central1 \
  --format='yaml(spec.template.spec.containers[0].env)'
```

**Check that:**
- ✅ `REDIRECT_URI` uses the long URL format
- ✅ `LOCAL_DEV_MODE=False`
- ✅ `DEBUG=False`
- ✅ All OAuth credentials are set

---

### Step 7: Update Google OAuth Console

**CRITICAL:** Add production redirect URI to Google OAuth Console.

1. Go to: https://console.cloud.google.com/apis/credentials
2. Click your OAuth 2.0 Client ID
3. Under "Authorized redirect URIs", add:
   ```
   https://your-service-479012214712.us-central1.run.app/auth/callback
   ```
   (Use the EXACT URL from `$SERVICE_URL`)
4. Click "Save"

**Verification:**
- ✅ URL uses long format (project number, not hash)
- ✅ URL matches REDIRECT_URI environment variable exactly
- ✅ URL includes `/auth/callback` path

---

## Verification Checklist

After deployment, verify each item:

### ✅ Middleware Configuration

```bash
# Check your main.py
# SessionMiddleware should be added BEFORE ProxyHeadersMiddleware
```

### ✅ Environment Variables

```bash
gcloud run services describe your-service --region us-central1 \
  --format='yaml(spec.template.spec.containers[0].env)' | grep REDIRECT_URI
```

Expected: `https://your-service-479012214712.us-central1.run.app/auth/callback`

### ✅ Google OAuth Console

- Go to: https://console.cloud.google.com/apis/credentials
- Verify redirect URI matches Cloud Run REDIRECT_URI exactly

### ✅ Session Cookie Settings

```python
# Verify in your code:
same_site="lax"  ✅
https_only=True  ✅
path="/"  ✅
domain=None  ✅
```

### ✅ OAuth State Management

```python
# Verify you're NOT manually managing state:
# ❌ NO: state = secrets.token_urlsafe(32)
# ❌ NO: request.session['oauth_state'] = state
# ✅ YES: Let Authlib handle it automatically
```

### ✅ URL Consistency

```bash
# Get Cloud Run URL
SERVICE_URL=$(gcloud run services describe your-service --region us-central1 --format='value(status.url)')

# Check REDIRECT_URI env var
gcloud run services describe your-service --region us-central1 \
  --format='value(spec.template.spec.containers[0].env)' | grep REDIRECT_URI

# They must match EXACTLY
```

---

## Testing Your Deployment

### 1. Test OAuth Flow

```bash
# Get service URL
SERVICE_URL=$(gcloud run services describe your-service \
  --region us-central1 \
  --format='value(status.url)')

echo "Visit: $SERVICE_URL"
```

1. Open the URL in your browser
2. Click "Sign in with Google"
3. You may see "This app isn't verified" (normal for testing)
4. Click "Advanced" → "Go to [Your App] (unsafe)"
5. Grant permissions
6. Should redirect to dashboard (logged in)

### 2. Monitor Logs

```bash
# Watch logs in real-time
gcloud run services logs tail your-service --region us-central1 --follow
```

**Look for:**
- ✅ No "state mismatch" errors
- ✅ No "session not found" errors
- ✅ Successful OAuth token exchange

### 3. Test Session Persistence

1. Log in successfully
2. Refresh the page
3. Should remain logged in (session persists)
4. Close browser and reopen
5. Should remain logged in (cookie persists)

---

## Common Mistakes to Avoid

| ❌ Mistake | ✅ Correct |
|-----------|-----------|
| Add ProxyHeadersMiddleware before SessionMiddleware | Add SessionMiddleware first |
| Manually create and validate OAuth state | Let Authlib handle state automatically |
| Use `same_site="strict"` | Use `same_site="lax"` |
| Set `https_only=False` in production | Set `https_only=True` |
| Mix short and long Cloud Run URLs | Use long URL everywhere |
| Forget to update Google OAuth Console | Always add production URL |
| Hardcode `domain` in session cookie | Set `domain=None` |
| Use HTTP in production REDIRECT_URI | Always use HTTPS |

---

## Quick Reference Commands

```bash
# Deploy
gcloud run deploy your-service --source . --region us-central1

# Get service URL
gcloud run services describe your-service --region us-central1 --format='value(status.url)'

# View logs
gcloud run services logs tail your-service --region us-central1

# Update environment variables
gcloud run services update your-service --region us-central1 \
  --set-env-vars "KEY=VALUE"

# View all environment variables
gcloud run services describe your-service --region us-central1 \
  --format='yaml(spec.template.spec.containers[0].env)'
```

---

## Troubleshooting (If Something Goes Wrong)

If OAuth fails despite following the guide:

### Issue: "Invalid state parameter" or state mismatch

**Check:**
1. Middleware order (SessionMiddleware before ProxyHeadersMiddleware)
2. Not manually managing state
3. Session cookie settings (same_site="lax", https_only=True)

**Fix:**
```bash
# Review middleware order in main.py
# Ensure SessionMiddleware is added BEFORE ProxyHeadersMiddleware
```

### Issue: "redirect_uri_mismatch"

**Check:**
1. REDIRECT_URI environment variable
2. Google OAuth Console authorized URIs
3. URL format consistency (long vs short)

**Fix:**
```bash
# Get correct URL
SERVICE_URL=$(gcloud run services describe your-service --region us-central1 --format='value(status.url)')

# Update environment variable
gcloud run services update your-service --region us-central1 \
  --set-env-vars "REDIRECT_URI=${SERVICE_URL}/auth/callback"

# Update Google OAuth Console to match
```

### Issue: Session not persisting

**Check:**
1. ProxyHeadersMiddleware added (for HTTPS detection)
2. `https_only=True` in SessionMiddleware
3. `path="/"` in SessionMiddleware

**Fix:**
```python
# Verify ProxyHeadersMiddleware is added (production only)
if not LOCAL_DEV_MODE:
    app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")
```

### View Detailed Logs

```bash
# Watch logs with context
gcloud run services logs tail your-service --region us-central1 --follow

# Search for specific errors
gcloud run services logs read your-service --region us-central1 \
  --filter="severity=ERROR" --limit=50
```

---

## Summary: The Four Golden Rules

Remember these rules to avoid OAuth issues:

1. **✅ Middleware Order** - Add SessionMiddleware BEFORE ProxyHeadersMiddleware
2. **✅ Let Libraries Handle State** - Don't manually manage OAuth state
3. **✅ Cookie Configuration** - Use `same_site="lax"`, `https_only=True`, `path="/"`
4. **✅ URL Consistency** - Use the long Cloud Run URL format everywhere

Follow these rules exactly, and your OAuth flow will work perfectly on Google Cloud Run!

---

## Additional Resources

- [Google Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Authlib Documentation](https://docs.authlib.org/en/latest/)
- [Starlette Middleware](https://www.starlette.io/middleware/)
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- [FastAPI Security](https://fastapi.tiangolo.com/tutorial/security/)

---

*Last updated: January 2026*  
*Optimized for AI agents and human developers*
