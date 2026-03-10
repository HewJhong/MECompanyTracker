# Supabase PostgreSQL Setup Guide

Complete guide to using Supabase (free PostgreSQL) with SwiftInvite on Google Cloud Run.

## Why Supabase?

✅ **Free tier:** 500 MB database, unlimited API requests  
✅ **Shared database:** All users see the same data  
✅ **Persistent:** Data never gets lost  
✅ **Easy setup:** 5-10 minutes  
✅ **Production-ready:** Automatic backups, SSL connections  

**Cost:** $0/month (Free tier is sufficient for 50-100 users)

---

## Step 1: Create Supabase Account

1. Go to [supabase.com](https://supabase.com)
2. Click "Start your project" → Sign up with GitHub
3. Click "New Project"

### Project Settings:
- **Name:** `swiftinvite` (or your preferred name)
- **Database Password:** Choose a strong password (save this!)
- **Region:** Choose closest to your Cloud Run region
  - If Cloud Run is in `us-central1`, choose `East US` or `West US`
- **Pricing Plan:** Free (default)

4. Click "Create new project" (takes ~2 minutes to provision)

---

## Step 2: Get Database Connection String

1. In your Supabase project dashboard, go to:
   - **Settings** (gear icon) → **Database**

2. Scroll down to **Connection string** section

3. Select **Connection string** tab (not URI mode)

4. Copy the connection string. It looks like:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxxx.supabase.co:5432/postgres
   ```

5. **Replace `[YOUR-PASSWORD]`** with your actual database password

### Example:
```
postgresql://postgres:MySecurePass123@db.abcdefghijklmno.supabase.co:5432/postgres
```

**⚠️ Important:** Keep this connection string secure! Don't commit it to Git.

---

## Step 3: Update Cloud Run to Use Supabase

### Get Your Current Environment Variables

First, let's preserve your existing OAuth settings:

```bash
# Get current service URL
SERVICE_URL=$(gcloud run services describe swiftinvite --region us-central1 --format='value(status.url)')
echo "Service URL: $SERVICE_URL"
```

### Update Cloud Run with Supabase Database

```bash
# Set your Supabase connection string
# Replace with YOUR actual connection string from Step 2
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.xxxxxxxxxxxxx.supabase.co:5432/postgres"

# Update Cloud Run service with new DATABASE_URL
gcloud run services update swiftinvite \
  --region us-central1 \
  --update-env-vars "DATABASE_URL=${DATABASE_URL}"
```

**Note:** This only updates the DATABASE_URL. All other environment variables (GOOGLE_CLIENT_ID, SESSION_SECRET_KEY, etc.) remain unchanged.

---

## Step 4: Run Database Migrations

Now we need to initialize the database schema on Supabase.

### Option A: Run Migration from Local Machine

1. **Install PostgreSQL client** (if not already installed):
   ```bash
   # macOS
   brew install postgresql
   
   # Ubuntu/Debian
   sudo apt-get install postgresql-client
   ```

2. **Set DATABASE_URL locally** (temporary):
   ```bash
   # Replace with your Supabase connection string
   export DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.xxxxxxxxxxxxx.supabase.co:5432/postgres"
   ```

3. **Run migrations:**
   ```bash
   cd "/Users/jinhong/Documents/My Projects/SwiftInvite"
   source venv/bin/activate
   alembic upgrade head
   ```

   You should see:
   ```
   INFO  [alembic.runtime.migration] Running upgrade  -> fe46f8f59575, Initial schema
   INFO  [alembic.runtime.migration] Running upgrade fe46f8f59575 -> add_role_to_members, Add role column to members table
   ```

### Option B: Run Migration via Cloud Run Job (Alternative)

If you prefer, you can create a one-time job in Cloud Run:

```bash
# Create a Cloud Run job to run migrations
gcloud run jobs create swiftinvite-migration \
  --region us-central1 \
  --image gcr.io/YOUR_PROJECT_ID/swiftinvite \
  --set-env-vars "DATABASE_URL=${DATABASE_URL}" \
  --command="alembic" \
  --args="upgrade,head" \
  --max-retries 0

# Execute the migration job
gcloud run jobs execute swiftinvite-migration --region us-central1
```

---

## Step 5: Verify Connection

### Test Database Connection

```bash
# Test connection from your local machine
psql "${DATABASE_URL}" -c "SELECT * FROM users LIMIT 1;"
```

Or visit your Cloud Run URL and check if the app loads:
```bash
# Open your app
SERVICE_URL=$(gcloud run services describe swiftinvite --region us-central1 --format='value(status.url)')
echo "Visit: $SERVICE_URL"
open $SERVICE_URL
```

### Check Tables Were Created

In Supabase dashboard:
1. Go to **Table Editor** (left sidebar)
2. You should see tables: `users`, `oauth_tokens`, `members`, `meetings`

---

## Step 6: Upload CSV Data

Now that the database is set up:

1. Visit your Cloud Run URL
2. Log in with Google OAuth
3. Upload your CSV file with committee members
4. **This data will now be shared across all users!** 🎉

---

## Verification Checklist

- [ ] Supabase project created
- [ ] Database connection string obtained
- [ ] Cloud Run updated with new DATABASE_URL
- [ ] Migrations run successfully (4 tables created)
- [ ] App loads without errors
- [ ] CSV upload works
- [ ] Test user can see the uploaded data
- [ ] Another test user can also see the same data

---

## Monitoring & Management

### View Data in Supabase

1. Go to Supabase dashboard
2. Click **Table Editor**
3. Browse your `members`, `meetings`, `users` tables
4. You can manually edit data here if needed

### View Logs

```bash
# View Cloud Run logs
gcloud run services logs tail swiftinvite --region us-central1
```

### Connection Pooling (Optional, for high traffic)

If you ever get connection errors with many users:

1. Go to Supabase → **Settings** → **Database** → **Connection Pooling**
2. Copy the **Transaction** mode connection string
3. Update your Cloud Run DATABASE_URL with the pooler connection string

---

## Troubleshooting

### Error: "connection refused" or "could not connect"

**Check:**
- DATABASE_URL is correct (no typos)
- Password doesn't contain special characters that need URL encoding
- Supabase project is active (not paused)

**Fix:**
```bash
# URL encode special characters in password
# Example: If password is "Pass@123!", encode @ as %40
DATABASE_URL="postgresql://postgres:Pass%40123!@db.xxx.supabase.co:5432/postgres"
```

### Error: "relation does not exist"

**Cause:** Migrations haven't been run

**Fix:** Run Step 4 again (database migrations)

### Error: "too many connections"

**Cause:** Free tier has connection limits (60 connections)

**Fix:** Enable connection pooling in Supabase (see Monitoring section)

---

## Cost & Limits

### Supabase Free Tier:
- **Database:** 500 MB (plenty for 100+ users)
- **Connections:** 60 concurrent
- **Bandwidth:** Unlimited
- **Backups:** Daily (7 days retention)

### When to Upgrade:
- Database > 500 MB → Supabase Pro ($25/month for 8 GB)
- Need more connections → Enable pooling (free) or upgrade
- Need point-in-time recovery → Supabase Pro

**For 50 test users:** Free tier is more than sufficient! 🎉

---

## Security Notes

✅ **SSL/TLS:** Supabase enforces encrypted connections  
✅ **Backups:** Automatic daily backups  
✅ **Access Control:** Only accessible via connection string  
✅ **Secrets:** Store DATABASE_URL as Cloud Run environment variable (not in code)

---

## Next Steps

After setup:
1. Share your Cloud Run URL with test users
2. Have someone upload the committee roster CSV
3. Verify all users can see the same data
4. Monitor usage in Supabase dashboard

---

## Summary

You now have:
- ✅ Free PostgreSQL database (Supabase)
- ✅ Shared data across all users
- ✅ Persistent data (survives restarts)
- ✅ Automatic backups
- ✅ No monthly costs

**Total Cost:** $0/month 🎉
