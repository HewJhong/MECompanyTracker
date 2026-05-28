# Current User & Auth

The app needs to know **who is using it** for:

- **Sidebar**: show name and role (e.g. "Jane Student", "Committee Lead")
- **Committee Workspace**: filter "My assignments" by the current user (PIC)
- **Settings**: prefill profile (name, email, role)
- **Update API**: who to record in Thread_History and logs

Right now there is **no auth or deployment**. Identity is provided by **env vars** and optionally by a **Committee_Members** sheet for roles.

---

## Without Auth (Current Setup)

### 1. Environment variables

Set in `.env.local` (or in Cloud Run env vars when deployed):

| Variable | Description | Example |
|--------|-------------|---------|
| `NEXT_PUBLIC_CURRENT_USER_NAME` | Display name; used to filter "My assignments" (must match PIC in the main sheet) | `Ryan Chen` |
| `NEXT_PUBLIC_CURRENT_USER_EMAIL` | Email (optional; used for role lookup and profile) | `ryan@example.com` |
| `NEXT_PUBLIC_CURRENT_USER_ROLE` | Role/title (optional; overrides Committee_Members if set) | `Committee Lead` |

- If **none** of these are set, the UI shows **"Guest"** and **"Committee Member"**, and Committee Workspace shows no assignments (with a short notice).
- **My assignments** = rows where the main sheet’s Committee PIC column equals `NEXT_PUBLIC_CURRENT_USER_NAME`. So the name in env must match the PIC names in the spreadsheet.

### 2. Committee_Members sheet (optional data source for roles)

To **query a person’s position/role from the spreadsheet** instead of env:

1. Add a sheet named **`Committee_Members`** in the same workbook.
2. Columns (header row + data from row 2):
   - **A**: Name (must match PIC names or the env name)
   - **B**: Email (optional; used for lookup)
   - **C**: Role / Position (e.g. "Committee Lead", "Outreach Committee")

3. The **`/api/me`** endpoint:
   - Uses env for **name** and **email**.
   - For **role**: if `NEXT_PUBLIC_CURRENT_USER_ROLE` is set, uses that; otherwise looks up the row in `Committee_Members` by name or email and uses column C.

So: **committee name and position** can come from the **Committee_Members** sheet; the **current user identity** (who is “me”) still comes from env until you add auth.

### 3. Where it’s used

- **Layout**: sidebar user block shows name + role from `/api/me` (via `CurrentUserContext`).
- **Settings**: profile tab is prefilled from the same context (name, email, role).
- **Committee page**: “My assignments” = companies where `pic === currentUser`; `currentUser` is `user.name` from context (i.e. from `/api/me` → env name).

---

## With Auth (After Deployment / Login)

When you add real auth (e.g. Google Sign-In, OAuth, or Cloud Run IAP):

1. **Replace `/api/me`** so it reads the **signed-in user** (session or token) instead of env:
   - Return `name` and `email` from the auth provider.
   - Keep using **Committee_Members** to resolve **role** by matching name/email, or store role in your user DB.

2. **Stop using** `NEXT_PUBLIC_CURRENT_USER_*` for identity; you can keep them only as fallbacks for local dev if you want.

3. **Committee Workspace** stays the same: it still filters by “current user name”. The only change is that name comes from auth instead of env.

4. **Update API** already accepts a `user` in the request body for logs and Thread_History; ensure the frontend sends the authenticated user’s name (or id) when calling it.

---

## Summary

| Need | Current (no auth) | With auth |
|------|-------------------|-----------|
| Who is the current user? | Env: `NEXT_PUBLIC_CURRENT_USER_NAME` (and email) | Session / token from auth provider |
| Where does role/position come from? | Env `NEXT_PUBLIC_CURRENT_USER_ROLE` or **Committee_Members** sheet | Same sheet or your user DB, keyed by auth user |
| My assignments | Filter by env name (must match PIC in sheet) | Filter by authenticated user name (or id mapped to PIC) |

So: **yes**, the hard-coded “My assignments” (previously "Ryan Chen") was because auth and deployment were not set up. It’s now driven by **one place** (env + optional Committee_Members). Once you add auth, you only need to change `/api/me` and where the frontend gets the current user from (e.g. same context, but filled from session instead of env).
