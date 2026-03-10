# Security Best Practices for SwiftInvite

This document outlines critical security measures implemented in SwiftInvite and how to verify they are working correctly.

---

## Table of Contents

1. [Session Isolation](#session-isolation)
2. [HTTP Cache Prevention](#http-cache-prevention)
3. [Authentication & Authorization](#authentication--authorization)
4. [Security Headers](#security-headers)
5. [Verification Checklist](#verification-checklist)
6. [Common Security Issues](#common-security-issues)

---

## Session Isolation

### The Problem (Critical Vulnerability!)

**Issue:** Without proper cache-control headers, authenticated web pages can be cached by:
- Cloud Run's edge cache
- Browser cache
- Intermediate proxies/CDNs
- Load balancers

**Impact:** When User A logs in, their authenticated HTML page (with their name, email, and data) gets cached. When User B visits the same URL, they receive User A's cached page, exposing User A's data to User B.

**Severity:** 🚨 **CRITICAL** - This is a data leakage vulnerability that exposes user information across sessions.

### The Solution

**1. No-Cache Headers on All HTML Responses**

```python
# In main.py
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Add security headers to prevent caching and session leakage."""
    response = await call_next(request)
    
    # For all HTML responses, add strict no-cache headers
    if "text/html" in response.headers.get("content-type", ""):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        response.headers["Vary"] = "Cookie"  # Response varies by session cookie
    
    return response
```

**What each header does:**
- `no-store` - Never cache this response (strictest)
- `no-cache` - Must revalidate with server before using cached copy
- `must-revalidate` - Stale cache cannot be used
- `private` - Only browser can cache, not shared caches
- `max-age=0` - Cache expires immediately
- `Pragma: no-cache` - HTTP/1.0 backward compatibility
- `Expires: 0` - Additional backward compatibility
- `Vary: Cookie` - Tells caches that responses differ per cookie

**2. Session Regeneration on Login**

```python
# In google_callback function
# CRITICAL: Clear existing session and create new one to prevent session fixation
old_session_data = dict(request.session)
request.session.clear()

# Set new user session data
request.session['user_id'] = user.id
request.session['user_email'] = user.email
request.session['user_name'] = user.name
```

**Why this matters:** Regenerating the session ID on login prevents:
- Session fixation attacks
- Session ID reuse across users
- Stale session data from being mixed with new login

### Testing Session Isolation

**Test Procedure:**

1. Open two different browsers (Chrome and Firefox) or two incognito windows
2. Log in as User A in Browser 1
3. Log in as User B in Browser 2
4. Verify:
   - Browser 1 shows User A's email/name
   - Browser 2 shows User B's email/name
   - Refreshing either browser maintains correct user
   - No cross-contamination of data

**Automated Test:**

```bash
# Check headers
SERVICE_URL="https://your-app.run.app"

# Should return cache-control headers
curl -I $SERVICE_URL | grep -i "cache-control"

# Should return: Cache-Control: no-store, no-cache, must-revalidate, private, max-age=0
```

---

## HTTP Cache Prevention

### Why This Matters for Cloud Run

Cloud Run includes an **automatic edge cache** for HTTP responses. This is great for static content but **dangerous for authenticated pages**.

Without proper headers:
1. User A logs in → Server generates HTML with "Welcome, User A"
2. Cloud Run edge cache stores this response
3. User B visits same URL → Gets cached "Welcome, User A" page
4. **Security breach: User B sees User A's data**

### Implementation

The `add_security_headers` middleware ensures:
- **HTML pages** (with user data) are NEVER cached
- **Static assets** (CSS, JS) can still be cached if needed
- **API responses** with JSON data are not cached (API clients handle caching)

### What Gets Cached vs Not Cached

| Resource Type | Cached? | Why |
|--------------|---------|-----|
| HTML pages | ❌ NO | Contains user-specific data |
| API JSON responses | ❌ NO | User-specific data |
| Static CSS/JS | ✅ CAN BE | No user data |
| Images | ✅ CAN BE | No user data |

---

## Authentication & Authorization

### Access Token Management

**Every Google Calendar API call MUST include the user's access token.**

**Correct Pattern:**

```python
@app.post("/api/create-invite")
async def create_invite(
    invite_request: CreateInviteRequest,
    http_request: Request,
    current_user=Depends(auth.get_current_user)  # Requires authentication
):
    # Get user's OAuth tokens
    user_tokens = await auth.get_user_tokens(http_request)
    
    if not user_tokens:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    # Pass access_token to Google Calendar service
    event_result = google_calendar_service.create_calendar_event(
        access_token=user_tokens['access_token'],  # REQUIRED
        title=invite_request.title,
        # ... other params
    )
```

**Common Mistake:**

```python
# ❌ WRONG - Missing access_token
event_result = google_calendar_service.create_calendar_event(
    title=invite_request.title,
    # Missing: access_token parameter
)
```

**Error Message:**
```
create_calendar_event() missing 1 required positional argument: 'access_token'
```

### Endpoints That Require Authentication

All of these endpoints MUST:
1. Use `current_user=Depends(auth.get_current_user)`
2. Get user tokens: `user_tokens = await auth.get_user_tokens(http_request)`
3. Pass `access_token` to Google Calendar service

**Required:**
- `/api/create-invite` - Creating calendar events
- `/api/create-single-invite` - Single user invites
- `/api/meetings/{id}` (PUT) - Updating meetings
- `/api/meetings/{id}` (DELETE) - Canceling meetings
- `/api/test-calendar` - Testing calendar connection

---

## Security Headers

### Required Headers for All HTML Responses

```
Cache-Control: no-store, no-cache, must-revalidate, private, max-age=0
Pragma: no-cache
Expires: 0
Vary: Cookie
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
```

### What Each Header Protects Against

| Header | Protection | Why We Need It |
|--------|-----------|----------------|
| `Cache-Control: no-store` | Prevents ALL caching | Stops session leakage |
| `Vary: Cookie` | Cache varies by session | Even if cached, varies by user |
| `X-Frame-Options: DENY` | Clickjacking | Prevents embedding in iframes |
| `X-Content-Type-Options: nosniff` | MIME confusion | Prevents MIME-type attacks |
| `X-XSS-Protection` | XSS attacks | Browser XSS filter |
| `Referrer-Policy` | Info leakage | Limits referrer header exposure |

---

## Verification Checklist

### Pre-Deployment

- [ ] `add_security_headers` middleware is present in `main.py`
- [ ] Session regeneration happens in OAuth callback
- [ ] All calendar endpoints include `access_token` parameter
- [ ] All authenticated endpoints use `Depends(auth.get_current_user)`

### Post-Deployment

- [ ] Check headers with curl: `curl -I https://your-app.run.app/`
- [ ] Verify `Cache-Control: no-store` is present
- [ ] Test session isolation with two browsers
- [ ] Create a test meeting to verify calendar integration works
- [ ] Check logs for any authentication errors

### Regular Security Audits

**Monthly:**
- [ ] Test session isolation with multiple users
- [ ] Review Cloud Run logs for suspicious activity
- [ ] Verify all users have latest version with security fixes

**After Each Deployment:**
- [ ] Force all users to log out and log back in
- [ ] Test with two browsers to confirm session isolation
- [ ] Verify cache headers are present

---

## Common Security Issues

### Issue 1: Session Leakage

**Symptoms:**
- Users see other users' names/emails
- Dashboard shows wrong user data
- Multiple users share same session

**Root Cause:**
- Missing `Cache-Control` headers
- Authenticated pages cached by Cloud Run/browser/proxy

**Fix:**
1. Add `add_security_headers` middleware to `main.py`
2. Deploy update
3. Force all users to log out
4. Clear all caches

**Prevention:**
- Always test session isolation after deployment
- Never remove cache-control headers
- Include header checks in deployment checklist

### Issue 2: Missing Access Token

**Symptoms:**
```
Error: create_calendar_event() missing 1 required positional argument: 'access_token'
```

**Root Cause:**
- Endpoint doesn't get user tokens
- Not passing `access_token` to Google Calendar service

**Fix:**
```python
# Add to endpoint
user_tokens = await auth.get_user_tokens(http_request)
if not user_tokens:
    raise HTTPException(status_code=401, detail="Authentication required")

# Pass to calendar service
google_calendar_service.create_calendar_event(
    access_token=user_tokens['access_token'],
    # ... other params
)
```

**Prevention:**
- Always use `current_user=Depends(auth.get_current_user)` for authenticated endpoints
- Always get user tokens before calling Google Calendar API
- Test all calendar operations after deployment

### Issue 3: Session Fixation

**Symptoms:**
- Old session IDs still work after new login
- Session IDs predictable or reused

**Root Cause:**
- Not regenerating session on login

**Fix:**
```python
# In OAuth callback
request.session.clear()  # Clear old session
request.session['user_id'] = user.id  # Create new session
```

**Prevention:**
- Always regenerate session on login
- Use secure session settings (https_only, same_site)

---

## Environment-Specific Security

### Local Development (LOCAL_DEV_MODE=True)

**Relaxed Security (ONLY for local dev):**
- HTTP allowed (no HTTPS requirement)
- Mock OAuth tokens
- Simplified authentication

**⚠️ NEVER use LOCAL_DEV_MODE=True in production!**

### Production (LOCAL_DEV_MODE=False)

**Strict Security:**
- HTTPS only (`https_only=True` for cookies)
- Real OAuth tokens
- Full authentication flow
- All security headers enforced

### Session Configuration

```python
app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET_KEY,
    session_cookie="swiftinvite_session",
    max_age=86400,  # 24 hours
    same_site="lax",  # Prevents CSRF, allows OAuth
    https_only=not LOCAL_DEV_MODE,  # HTTPS only in production
    path="/",
    domain=None  # Auto-set domain
)
```

**Important Settings:**
- `https_only=True` - Cookies only sent over HTTPS (production)
- `same_site="lax"` - Prevents CSRF while allowing OAuth redirects
- `max_age=86400` - Sessions expire after 24 hours of inactivity

---

## Security Incident Response

### If Session Leakage Is Discovered

**Immediate Actions:**
1. ⚠️ **Take app offline immediately** or restrict to single user
2. Notify all users about potential data exposure
3. Review logs to determine scope of exposure
4. Deploy security fix
5. Force password reset for all users (if applicable)
6. Test thoroughly before bringing back online

### If OAuth Tokens Are Compromised

**Immediate Actions:**
1. Revoke all OAuth tokens in Google Console
2. Rotate `SESSION_SECRET_KEY` and `ENCRYPTION_KEY`
3. Force all users to re-authenticate
4. Review logs for suspicious calendar access
5. Notify affected users

---

## Additional Resources

- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [HTTP Caching Best Practices](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching)
- [Cloud Run Security Best Practices](https://cloud.google.com/run/docs/securing/managing-access)
- [OAuth 2.0 Security Best Practices](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)

---

**Last Updated:** January 23, 2026  
**Version:** 1.0  
**Status:** ✅ Security measures implemented and verified
