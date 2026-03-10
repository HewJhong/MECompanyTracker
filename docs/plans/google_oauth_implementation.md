# Implementation Plan: Google OAuth Authentication for Committee Workspaces

## Overview

Implement Google OAuth authentication to enable personalized committee workspaces where each logged-in user can see only companies assigned to them. This will replace the current mock authentication system with real Google login.

## Current State Analysis

### ✅ Already Implemented
- `CurrentUserContext` provides user state management
- `/api/me` endpoint exists for user identity
- Committee page (`pages/committee.tsx`) already filters companies by `user.name`
- User context is wrapped in `_app.tsx`
- Companies have a `pic` (Person in Charge) field that maps to user names

### 🔧 Needs Implementation
- Google OAuth configuration and credentials
- NextAuth.js integration for session management
- User email → Committee member name mapping
- Login/Logout UI components
- Protected routes (optional)
- Session persistence

---

## Technical Approach

### Authentication Library: NextAuth.js v5 (Auth.js)

**Why NextAuth.js?**
- Industry standard for Next.js authentication
- Built-in Google OAuth provider
- Server-side session management
- Easy integration with Next.js API routes
- TypeScript support

---

## Proposed Changes

### Phase 1: Google OAuth Setup (Google Cloud Console)

#### 1.1 Configure OAuth Consent Screen
**Location**: Google Cloud Console → APIs & Services → OAuth consent screen

**Steps**:
1. Select "Internal" user type (if using Google Workspace) or "External"
2. Fill in application details:
   - App name: "ME Company Tracker"
   - User support email: [your-email]
   - Developer contact: [your-email]
3. Add scopes:
   - `userinfo.email`
   - `userinfo.profile`
   - `openid`
4. Save and continue

#### 1.2 Create OAuth 2.0 Credentials
**Location**: Google Cloud Console → APIs & Services → Credentials

**Steps**:
1. Create OAuth 2.0 Client ID
2. Application type: "Web application"
3. Name: "ME Company Tracker - Production"
4. Authorized JavaScript origins:
   - `https://outreach-tracker-8073712255.us-central1.run.app`
   - `http://localhost:3000` (for local development)
5. Authorized redirect URIs:
   - `https://outreach-tracker-8073712255.us-central1.run.app/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google`
6. Save and copy Client ID and Client Secret

---

### Phase 2: Install and Configure NextAuth.js

#### 2.1 Install Dependencies
**File**: `package.json`

```bash
npm install next-auth@beta
```

**Note**: Using v5 (beta) for Next.js 13+ compatibility

#### 2.2 Create Auth Configuration
**File**: [NEW] `lib/auth.ts`

```typescript
import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import type { NextAuthConfig } from "next-auth"

export const authConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (account && user) {
        token.accessToken = account.access_token
        token.email = user.email
        token.name = user.name
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email as string
        session.user.name = token.name as string
      }
      return session
    },
  },
  pages: {
    signIn: '/auth/signin',  // Custom sign-in page (optional)
  },
} satisfies NextAuthConfig

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)
```

#### 2.3 Create API Route Handler
**File**: [NEW] `pages/api/auth/[...nextauth].ts`

```typescript
import { handlers } from "@/lib/auth"
export const { GET, POST } = handlers
```

#### 2.4 Update Environment Variables
**Files**: `.env.local`, Cloud Run environment

**Local Development** (`.env.local`):
```bash
# Existing variables...
GOOGLE_SERVICE_ACCOUNT_EMAIL=...
GOOGLE_PRIVATE_KEY=...
SPREADSHEET_ID_1=...
SPREADSHEET_ID_2=...

# New OAuth variables
GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
NEXTAUTH_SECRET=your-generated-secret  # Generate with: openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000
```

**Production** (Cloud Run):
```bash
# Add to Secret Manager or environment variables
GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
NEXTAUTH_SECRET=your-generated-secret
NEXTAUTH_URL=https://outreach-tracker-8073712255.us-central1.run.app
```

---

### Phase 3: Update /api/me Endpoint

#### 3.1 Modify User Identity Endpoint
**File**: `pages/api/me.ts`

**Current Implementation**: Returns mock/env-based user

**New Implementation**:
```typescript
import type { NextApiRequest, NextApiResponse } from 'next';
import { auth } from '@/lib/auth';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await auth();
  
  if (!session || !session.user) {
    return res.status(401).json({ 
      name: null, 
      email: null, 
      role: null,
      authenticated: false 
    });
  }

  // Map email to committee member name
  // This mapping should match the "pic" values in your Google Sheets
  const emailToNameMap: Record<string, string> = {
    'john@example.com': 'John Smith',
    'jane@example.com': 'Jane Doe',
    // Add all committee members here
  };

  const userName = emailToNameMap[session.user.email || ''] || session.user.name || 'Guest';

  return res.json({
    name: userName,
    email: session.user.email,
    role: 'Committee Member',
    authenticated: true
  });
}
```

---

### Phase 4: Add Login/Logout UI Components

#### 4.1 Create Auth Buttons Component
**File**: [NEW] `components/AuthButton.tsx`

```typescript
'use client';

import { signIn, signOut } from 'next-auth/react';
import { useCurrentUser } from '@/contexts/CurrentUserContext';

export default function AuthButton() {
  const { user, loading } = useCurrentUser();

  if (loading) {
    return <div className="h-10 w-24 bg-gray-200 animate-pulse rounded-lg"></div>;
  }

  if (user && user.email) {
    return (
      <div className="flex items-center gap-3">
        <div className="text-sm text-right">
          <p className="font-medium text-slate-900">{user.name}</p>
          <p className="text-slate-500 text-xs">{user.email}</p>
        </div>
        <button
          onClick={() => signOut()}
          className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => signIn('google')}
      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24">
        <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      Sign in with Google
    </button>
  );
}
```

#### 4.2 Add Auth Button to Layout
**File**: `components/Layout.tsx`

**Modification**: Add `<AuthButton />` to the header/navigation

```tsx
import AuthButton from './AuthButton';

// In the header section:
<div className="flex items-center gap-4">
  {/* Existing navigation items */}
  <AuthButton />
</div>
```

---

### Phase 5: Update Committee Page

#### 5.1 Add Authentication Check
**File**: `pages/committee.tsx`

**Current**: Shows all assigned companies, displays warning if no user

**Updated**: Redirect to sign-in if not authenticated

```typescript
import { useCurrentUser } from '../contexts/CurrentUserContext';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

export default function CommitteePage() {
    const router = useRouter();
    const { user, loading } = useCurrentUser();
    
    // Optional: Redirect to sign-in if not authenticated
    useEffect(() => {
        if (!loading && !user?.email) {
            router.push('/auth/signin');
        }
    }, [loading, user, router]);

    // Rest of the component...
}
```

**Note**: The filtering logic by `pic === currentUser` already exists and will work once authentication is in place.

---

### Phase 6: Deploy Configuration Updates

#### 6.1 Store OAuth Secrets in Secret Manager
```bash
# Create secrets for OAuth credentials
echo "your-client-id" | gcloud secrets create google-oauth-client-id --data-file=- --replication-policy="automatic"
echo "your-client-secret" | gcloud secrets create google-oauth-client-secret --data-file=- --replication-policy="automatic"
echo "$(openssl rand -base64 32)" | gcloud secrets create nextauth-secret --data-file=- --replication-policy="automatic"

# Grant access to Cloud Run
gcloud secrets add-iam-policy-binding google-oauth-client-id --member="serviceAccount:8073712255-compute@developer.gserviceaccount.com" --role="roles/secretmanager.secretAccessor"
gcloud secrets add-iam-policy-binding google-oauth-client-secret --member="serviceAccount:8073712255-compute@developer.gserviceaccount.com" --role="roles/secretmanager.secretAccessor"
gcloud secrets add-iam-policy-binding nextauth-secret --member="serviceAccount:8073712255-compute@developer.gserviceaccount.com" --role="roles/secretmanager.secretAccessor"
```

#### 6.2 Update Cloud Run Service
```bash
gcloud run services update outreach-tracker \
  --region us-central1 \
  --set-env-vars "NEXTAUTH_URL=https://outreach-tracker-8073712255.us-central1.run.app" \
  --update-secrets "GOOGLE_OAUTH_CLIENT_ID=google-oauth-client-id:latest" \
  --update-secrets "GOOGLE_OAUTH_CLIENT_SECRET=google-oauth-client-secret:latest" \
  --update-secrets "NEXTAUTH_SECRET=nextauth-secret:latest"
```

---

## Email to Committee Member Name Mapping

### Option 1: Hardcoded Mapping (Recommended for MVP)
Update `pages/api/me.ts` with a mapping object:

```typescript
const emailToNameMap: Record<string, string> = {
  'john@example.com': 'John Smith',
  'jane@example.com': 'Jane Doe',
  // ... add all committee members
};
```

### Option 2: Google Sheets Configuration (Future Enhancement)
Create a "Users" sheet in your Google Spreadsheet with columns:
- Email
- Name
- Role

Fetch this mapping dynamically in the `/api/me` endpoint.

---

## Verification Plan

### Manual Testing Steps

#### Test 1: Local Development OAuth Flow
**Prerequisites**: 
- OAuth credentials created in Google Cloud Console
- Environment variables set in `.env.local`

**Steps**:
1. Run `npm run dev`
2. Navigate to `http://localhost:3000`
3. Click "Sign in with Google" button
4. Complete Google OAuth consent flow
5. Verify you are redirected back to the app
6. Check that your name appears in the header
7. Navigate to `/committee`
8. Verify only companies where `pic` matches your mapped name are shown
9. Click "Sign Out"
10. Verify you are signed out and redirected

**Expected Results**:
- OAuth flow completes without errors
- User name displays correctly after login
- Committee page filters correctly
- Sign out works properly

#### Test 2: Production Deployment
**Prerequisites**:
- OAuth credentials include production URLs
- Secrets stored in Secret Manager
- Environment variables configured in Cloud Run

**Steps**:
1. Visit `https://outreach-tracker-8073712255.us-central1.run.app`
2. Click "Sign in with Google"
3. Complete OAuth flow
4. Verify redirect to production URL
5. Check committee workspace filtering
6. Test sign out

**Expected Results**:
- Same as Test 1, but on production URL
- No CORS or redirect URI errors

#### Test 3: Multiple Users
**Steps**:
1. Sign in with User A's Google account
2. Note which companies are shown in committee workspace
3. Sign out
4. Sign in with User B's Google account  
5. Verify different companies are shown (based on `pic` field)

**Expected Results**:
- Each user sees only their assigned companies
- No data leakage between users

---

## Rollback Plan

If authentication causes issues:

1. **Disable Auth Requirement**:
   - Comment out redirect logic in `committee.tsx`
   - Keep sign-in button available but optional

2. **Revert to Mock User**:
   - Restore original `/api/me` implementation
   - Use `NEXT_PUBLIC_CURRENT_USER_NAME` env var

3. **Remove NextAuth.js**:
   ```bash
   npm uninstall next-auth
   ```
   - Delete `/pages/api/auth/[...nextauth].ts`
   - Delete `/lib/auth.ts`

---

## Security Considerations

1. **Session Security**:
   - `NEXTAUTH_SECRET` must be strong (generated with `openssl rand -base64 32`)
   - Stored in Secret Manager, never committed to git

2. **OAuth Scope Minimal**:
   - Only request `email`, `profile`, `openid`
   - No access to user's Google Drive or other services

3. **User Type**:
   - If using Google Workspace, set OAuth consent screen to "Internal" to restrict to your organization
   - Otherwise use "External" but verify email domains in code

4. **Environment Variables**:
   - Never commit OAuth credentials to repository
   - Use `.env.local` for local development
   - Use Secret Manager for production

---

## Dependencies

### New NPM Packages
- `next-auth` (v5 beta): OAuth and session management

### Google Cloud Requirements
- OAuth consent screen configured
- OAuth 2.0 client credentials created
- Secret Manager for storing credentials

---

## Timeline Estimate

- **Phase 1** (Google OAuth Setup): 15 minutes
- **Phase 2** (Install/Configure NextAuth.js): 30 minutes
- **Phase 3** (Update /api/me): 20 minutes
- **Phase 4** (Add UI Components): 30 minutes
- **Phase 5** (Update Committee Page): 15 minutes
- **Phase 6** (Deploy & Configure): 20 minutes
- **Testing**: 30 minutes

**Total**: ~2-3 hours

---

## Questions for Review

1. **Email Mapping**: Do you have a list of all committee members' Google emails and their corresponding names as they appear in the `pic` field?

2. **Access Control**: Should the committee workspace require authentication, or should it be optional (with a fallback to showing all companies)?

3. **User Restriction**: Should we restrict sign-ins to specific Google Workspace domain (if you have one)?

4. **Additional Features**: Do you want to add any role-based access control (e.g., "Admin" vs "Committee Member")?

---

## Success Criteria

- [ ] Users can sign in with Google OAuth
- [ ] Authenticated users see their name displayed in the UI
- [ ] Committee workspace shows only companies assigned to logged-in user
- [ ] Sign out functionality works correctly
- [ ] No authentication errors in production
- [ ] Session persists across page refreshes
- [ ] Works on both local development and production deployment
