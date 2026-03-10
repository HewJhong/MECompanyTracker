# Implementation Plan: Deploy Outreach Tracker to Google Cloud Run

## Overview

Deploy the ME Company Tracker (Outreach Tracker) Next.js application to Google Cloud Run with production-grade configuration, security best practices, and proper environment variable management. This plan adapts proven deployment patterns from the SwiftInvite deployment while accounting for the Next.js framework and Google Sheets integration.

## Requirements

- Deploy Next.js application to Google Cloud Run
- Securely configure Google Service Account credentials for Sheets API access
- Set up environment variables for production
- Implement security headers and best practices
- Enable HTTPS and automatic scaling
- Stay within free tier limits if possible
- Ensure proper session management (if authentication is added later)

## Architecture Changes

### New Files to Create

1. **[Dockerfile](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/Dockerfile)** - Container configuration for Next.js app
2. **[.dockerignore](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/.dockerignore)** - Exclude unnecessary files from Docker build
3. **[.gcloudignore](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/.gcloudignore)** - Exclude files from Cloud Build
4. **[next.config.ts](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/next.config.ts)** - Update with production configuration

### Files to Modify

1. **[package.json](file:///Users/jinhong/Documents/My%20Projects/ME%20Company%20Tracker/outreach-tracker/package.json)** - Add build and start scripts if needed
2. **Environment Variables** - Migrate from `.env.local` to Cloud Run environment variables

## Implementation Steps

### Phase 1: Pre-Deployment Preparation

#### ✅ 1. **Verify Local Build** (File: package.json) - COMPLETED
   - **Action**: Ensure the Next.js app builds successfully locally
   - **Why**: Catch build issues before deploying to Cloud Run
   - **Dependencies**: None
   - **Risk**: Low
   - **Commands**:
     ```bash
     cd outreach-tracker
     npm run build
     npm run start
     ```
   - **Expected Result**: App builds without errors and runs on localhost:3000
   - **✅ COMPLETED**: Build succeeded with exit code 0

#### ✅ 2. **Review Environment Variables** (File: .env.local) - COMPLETED
   - **Action**: Document all required environment variables from `.env.local`
   - **Why**: Need to configure these in Cloud Run
   - **Dependencies**: None
   - **Risk**: Low
   - **Required Variables**:
      - `GOOGLE_SERVICE_ACCOUNT_EMAIL` = jhewcompanytracker@company-tracker-485803.iam.gserviceaccount.com
      - `GOOGLE_PRIVATE_KEY` = [Private key available in .env.local]
      - `SPREADSHEET_ID_1` = 1OJPyRcnpLy7z4cEP8inZhnkza6yCqf7PC9wVW3TvXag
      - `SPREADSHEET_ID_2` = 1VzMVzeyb2PaZGd2RzwFYLk18nv1oAWnCg54OYOHTUHo
   - **✅ COMPLETED**: All 4 environment variables documented

#### ✅ 3. **Check Google Cloud Prerequisites** - COMPLETED
   - **Action**: Verify Google Cloud account setup and billing
   - **Why**: Required for Cloud Run deployment
   - **Dependencies**: None
   - **Risk**: Low
   - **Checklist**:
      - [x] Google Cloud account created
      - [x] Billing enabled
      - [x] `gcloud` CLI installed (version 553.0.0)
      - [x] Project ID identified: swiftinvite
   - **✅ COMPLETED**: gcloud CLI verified, project 'swiftinvite' active

---

### Phase 2: Docker Configuration

#### 4. **Create Dockerfile** (File: Dockerfile)
   - **Action**: Create optimized multi-stage Dockerfile for Next.js
   - **Why**: Containerize the application for Cloud Run deployment
   - **Dependencies**: Step 1
   - **Risk**: Medium
   - **Implementation**:
     ```dockerfile
     # Use official Node.js runtime
     FROM node:20-alpine AS base
     
     # Install dependencies only when needed
     FROM base AS deps
     RUN apk add --no-cache libc6-compat
     WORKDIR /app
     
     # Copy package files
     COPY package*.json ./
     RUN npm ci
     
     # Rebuild source code
     FROM base AS builder
     WORKDIR /app
     COPY --from=deps /app/node_modules ./node_modules
     COPY . .
     
     # Build Next.js app
     ENV NEXT_TELEMETRY_DISABLED 1
     RUN npm run build
     
     # Production image
     FROM base AS runner
     WORKDIR /app
     
     ENV NODE_ENV production
     ENV NEXT_TELEMETRY_DISABLED 1
     
     RUN addgroup --system --gid 1001 nodejs
     RUN adduser --system --uid 1001 nextjs
     
     # Copy necessary files
     COPY --from=builder /app/public ./public
     COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
     COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
     
     USER nextjs
     
     EXPOSE 3000
     
     ENV PORT 3000
     ENV HOSTNAME "0.0.0.0"
     
     CMD ["node", "server.js"]
     ```

#### 5. **Update next.config.ts** (File: next.config.ts)
   - **Action**: Enable standalone output for containerized deployment
   - **Why**: Reduces Docker image size and improves startup time
   - **Dependencies**: Step 4
   - **Risk**: Low
   - **Implementation**:
     ```typescript
     import type { NextConfig } from "next";
     
     const nextConfig: NextConfig = {
       output: 'standalone',
       // Add security headers
       async headers() {
         return [
           {
             source: '/:path*',
             headers: [
               {
                 key: 'X-Frame-Options',
                 value: 'DENY',
               },
               {
                 key: 'X-Content-Type-Options',
                 value: 'nosniff',
               },
               {
                 key: 'X-XSS-Protection',
                 value: '1; mode=block',
               },
               {
                 key: 'Referrer-Policy',
                 value: 'strict-origin-when-cross-origin',
               },
             ],
           },
         ];
       },
     };
     
     export default nextConfig;
     ```

#### 6. **Create .dockerignore** (File: .dockerignore)
   - **Action**: Exclude unnecessary files from Docker build
   - **Why**: Reduces build time and image size
   - **Dependencies**: None
   - **Risk**: Low
   - **Content**:
     ```
     # Dependencies
     node_modules
     npm-debug.log*
     yarn-debug.log*
     yarn-error.log*
     
     # Environment
     .env
     .env.local
     .env.*.local
     
     # Next.js
     .next
     out
     
     # Build artifacts
     *.tsbuildinfo
     
     # Git
     .git
     .gitignore
     
     # IDE
     .vscode
     .idea
     *.swp
     *.swo
     
     # Documentation
     *.md
     docs/
     
     # Scripts
     scripts/
     *.js
     !next.config.js
     
     # Sample files
     *.sample
     Sample Spreadsheet for Company Tracker.xlsx
     ```

#### 7. **Create .gcloudignore** (File: .gcloudignore)
   - **Action**: Exclude files from Cloud Build upload
   - **Why**: Speeds up build process
   - **Dependencies**: None
   - **Risk**: Low
   - **Content**:
     ```
     .gcloudignore
     .git
     .gitignore
     node_modules/
     .env
     .env.local
     .next/
     ```

---

### Phase 3: Google Cloud Setup

#### 8. **Initialize Google Cloud CLI**
   - **Action**: Configure gcloud CLI and enable required APIs
   - **Why**: Prepares Google Cloud environment for deployment
   - **Dependencies**: None
   - **Risk**: Low
   - **Commands**:
     ```bash
     # Login to Google Cloud
     gcloud auth login
     
     # Set or create project
     gcloud config set project [YOUR_PROJECT_ID]
     
     # Enable required APIs
     gcloud services enable run.googleapis.com
     gcloud services enable cloudbuild.googleapis.com
     gcloud services enable secretmanager.googleapis.com
     ```

#### 9. **Configure Google Service Account**
   - **Action**: Verify service account exists with Sheets API access
   - **Why**: Application needs service account credentials to access Google Sheets
   - **Dependencies**: Step 8
   - **Risk**: Medium
   - **Verification**:
     ```bash
     # List service accounts
     gcloud iam service-accounts list
     
     # Verify the service account email matches .env.local
     # Ensure it has "Editor" or "Sheets API" permissions
     ```
   - **Notes**:
     - Service account should already exist (from `.env.local`)
     - If not, create one and grant Sheets API access
     - Download JSON key if needed

---

### Phase 4: Secure Secret Management

> [!IMPORTANT]
> **Security Best Practice**: Store sensitive credentials in Secret Manager instead of environment variables.

#### 10. **Store Google Private Key in Secret Manager** (New approach)
   - **Action**: Create secret for Google service account private key
   - **Why**: More secure than plain environment variables; supports key rotation
   - **Dependencies**: Step 8, 9
   - **Risk**: Low
   - **Commands**:
     ```bash
     # Create secret from .env.local private key value
     # First, extract the private key to a temporary file
     echo "YOUR_PRIVATE_KEY" > /tmp/private_key.txt
     
     # Create the secret
     gcloud secrets create google-sheets-private-key \
       --data-file=/tmp/private_key.txt \
       --replication-policy="automatic"
     
     # Clean up temporary file
     rm /tmp/private_key.txt
     
     # Grant Cloud Run service account access to the secret
     gcloud secrets add-iam-policy-binding google-sheets-private-key \
       --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
       --role="roles/secretmanager.secretAccessor"
     ```

---

### Phase 5: Initial Deployment

#### 11. **Deploy to Cloud Run**
   - **Action**: Build and deploy to Cloud Run with basic configuration
   - **Why**: Get initial deployment running
   - **Dependencies**: Steps 4-10
   - **Risk**: Medium
   - **Commands**:
     ```bash
     cd /Users/jinhong/Documents/My\ Projects/ME\ Company\ Tracker/outreach-tracker
     
     # Deploy
     gcloud run deploy outreach-tracker \
       --source . \
       --platform managed \
       --region us-central1 \
       --allow-unauthenticated \
       --memory 512Mi \
       --cpu 1 \
       --max-instances 10 \
       --port 3000
     ```
   - **Expected Output**: Service URL like `https://outreach-tracker-xxxxx-uc.a.run.app`

#### 12. **Configure Environment Variables**
   - **Action**: Set all required environment variables in Cloud Run
   - **Why**: Application needs these to function
   - **Dependencies**: Step 11
   - **Risk**: High (App won't work without correct config)
   - **Commands**:
     ```bash
     # Get service URL
     SERVICE_URL=$(gcloud run services describe outreach-tracker \
       --region us-central1 \
       --format='value(status.url)')
     
     echo "Service URL: $SERVICE_URL"
     
     # Update environment variables
     gcloud run services update outreach-tracker \
       --region us-central1 \
       --set-env-vars "NODE_ENV=production" \
       --set-env-vars "NEXT_TELEMETRY_DISABLED=1" \
       --set-env-vars "GOOGLE_SERVICE_ACCOUNT_EMAIL=[YOUR_SERVICE_ACCOUNT_EMAIL]" \
       --set-env-vars "SPREADSHEET_ID_1=[YOUR_COMPANY_DB_SHEET_ID]" \
       --set-env-vars "SPREADSHEET_ID_2=[YOUR_OUTREACH_TRACKER_SHEET_ID]" \
       --update-secrets "GOOGLE_PRIVATE_KEY=google-sheets-private-key:latest"
     ```
   - **Alternative (if not using Secret Manager)**:
     ```bash
     # Set private key as environment variable (less secure)
     gcloud run services update outreach-tracker \
       --region us-central1 \
       --set-env-vars "GOOGLE_PRIVATE_KEY=[PRIVATE_KEY_WITH_NEWLINES_ESCAPED]"
     ```

---

### Phase 6: Verification and Testing

#### 13. **Test Deployment**
   - **Action**: Verify application loads and can access Google Sheets
   - **Why**: Ensure deployment is functional
   - **Dependencies**: Step 12
   - **Risk**: Low
   - **Tests**:
     1. Visit the service URL in browser
     2. Check that the homepage loads
     3. Verify Google Sheets data is displayed
     4. Test all major features (All Companies view, filters, etc.)
     5. Check browser console for errors

#### 14. **Verify Security Headers** (Critical Security Check)
   - **Action**: Confirm security headers are present
   - **Why**: Prevent caching and security vulnerabilities
   - **Dependencies**: Step 13
   - **Risk**: Low
   - **Commands**:
     ```bash
     # Check response headers
     curl -I $SERVICE_URL | grep -E "(X-Frame-Options|X-Content-Type-Options|X-XSS-Protection)"
     ```
   - **Expected Headers**:
     ```
     X-Frame-Options: DENY
     X-Content-Type-Options: nosniff
     X-XSS-Protection: 1; mode=block
     ```

#### 15. **Monitor Logs**
   - **Action**: Check Cloud Run logs for errors
   - **Why**: Identify and resolve runtime issues
   - **Dependencies**: Step 13
   - **Risk**: Low
   - **Commands**:
     ```bash
     # Tail logs in real-time
     gcloud run services logs tail outreach-tracker --region us-central1
     
     # View recent logs
     gcloud run services logs read outreach-tracker \
       --region us-central1 \
       --limit=50
     ```
   - **Look For**:
     - No "Google Sheets client" errors
     - No authentication failures
     - Successful page renders

---

### Phase 7: Production Optimization

#### 16. **Configure Resource Limits**
   - **Action**: Optimize memory, CPU, and scaling settings
   - **Why**: Balance performance and cost
   - **Dependencies**: Step 15
   - **Risk**: Low
   - **Commands**:
     ```bash
     gcloud run services update outreach-tracker \
       --region us-central1 \
       --memory 512Mi \
       --cpu 1 \
       --min-instances 0 \
       --max-instances 5 \
       --concurrency 80 \
       --cpu-throttling
     ```
   - **Rationale**:
     - `512Mi` memory: Sufficient for Next.js app with moderate traffic
     - `1` CPU: Adequate for I/O-bound Sheets operations
     - `min-instances 0`: Scale to zero when idle (free tier friendly)
     - `max-instances 5`: Prevent runaway costs
     - `concurrency 80`: Standard for Next.js apps

#### 17. **Set Up Custom Domain** (Optional)
   - **Action**: Configure custom domain if desired
   - **Why**: Professional URL instead of long Cloud Run URL
   - **Dependencies**: Step 16
   - **Risk**: Low
   - **Commands**:
     ```bash
     # Map custom domain
     gcloud run domain-mappings create \
       --service outreach-tracker \
       --domain your-domain.com \
       --region us-central1
     ```
   - **Note**: Requires domain verification and DNS configuration

#### 18. **Configure Automatic Deployments** (Optional)
   - **Action**: Set up Cloud Build triggers for CI/CD
   - **Why**: Automate future deployments
   - **Dependencies**: Step 16
   - **Risk**: Low
   - **Setup**:
     1. Connect GitHub repository to Cloud Build
     2. Create trigger on `main` branch push
     3. Use Dockerfile for build configuration
   - **Note**: This is optional; manual deployments may be preferred initially

---

## Testing Strategy

### Pre-Deployment Testing
- [ ] Local build succeeds: `npm run build`
- [ ] Local production server works: `npm start`
- [ ] Environment variables documented
- [ ] Google Sheets access verified locally

### Post-Deployment Testing
- [ ] Application loads at Cloud Run URL
- [ ] Homepage displays correctly
- [ ] Google Sheets data loads
- [ ] All Companies page works
- [ ] Filter functionality works
- [ ] Company details modal works
- [ ] Contact management works
- [ ] Duplicate detection works
- [ ] No console errors
- [ ] Security headers present: `curl -I [URL]`
- [ ] Logs show no errors

### Performance Testing
- [ ] Cold start time \u003c 5 seconds
- [ ] Page load time \u003c 2 seconds
- [ ] Sheets API calls succeed
- [ ] No memory leaks over 24 hours

### Cost Monitoring
- [ ] Within free tier limits
- [ ] No unexpected charges
- [ ] Scales to zero when idle

---

## Risks & Mitigations

### Risk 1: Google Sheets API Authentication Failure
- **Impact**: High - Application cannot load data
- **Probability**: Medium
- **Mitigation**: 
  - Verify service account credentials before deployment
  - Test private key format (newlines properly escaped)
  - Use Secret Manager for sensitive credentials
  - Keep backup of working `.env.local`

### Risk 2: Build Failure
- **Impact**: High - Cannot deploy
- **Probability**: Low
- **Mitigation**: 
  - Test build locally first
  - Review build logs carefully
  - Ensure all dependencies in `package.json`
  - Use Node 20 consistently (local and Cloud Run)

### Risk 3: Memory/CPU Limits Too Low
- **Impact**: Medium - App crashes or performs poorly
- **Probability**: Low
- **Mitigation**: 
  - Start with 512Mi memory, increase if needed
  - Monitor metrics in Cloud Run console
  - Set up alerting for crashes

### Risk 4: Exceeding Free Tier
- **Impact**: Medium - Unexpected costs
- **Probability**: Low (for internal tool with \u003c50 users)
- **Mitigation**: 
  - Set max instances to 5
  - Enable scale-to-zero
  - Set up billing alerts
  - Monitor usage weekly

### Risk 5: Private Key Exposure
- **Impact**: Critical - Unauthorized Sheets access
- **Probability**: Low
- **Mitigation**: 
  - Use Secret Manager instead of env vars
  - Never commit `.env.local` to git
  - Rotate keys if compromised
  - Use least-privilege service account

---

## Success Criteria

- [x] Application builds successfully with `npm run build`
- [ ] Docker image builds without errors
- [ ] Cloud Run deployment succeeds
- [ ] Application loads at production URL
- [ ] Google Sheets data displays correctly
- [ ] All core features functional:
  - [ ] All Companies view
  - [ ] Filtering and sorting
  - [ ] Company details modal
  - [ ] Contact editing
  - [ ] Duplicate detection
- [ ] Security headers present
- [ ] No errors in Cloud Run logs
- [ ] Application scales to zero when idle
- [ ] Memory usage \u003c 512Mi under normal load
- [ ] Cold start \u003c 5 seconds
- [ ] Page load \u003c 2 seconds
- [ ] Costs within free tier ($0/month)

---

## Rollback Plan

If deployment fails or issues arise:

1. **Immediate Rollback**:
   ```bash
   # List revisions
   gcloud run revisions list --service outreach-tracker --region us-central1
   
   # Rollback to previous working revision
   gcloud run services update-traffic outreach-tracker \
     --region us-central1 \
     --to-revisions [PREVIOUS_REVISION_NAME]=100
   ```

2. **Local Development Fallback**:
   - Keep local dev server running: `npm run dev`
   - Continue using locally until Cloud Run issues resolved

3. **Emergency Shutdown**:
   ```bash
   # Delete service if needed
   gcloud run services delete outreach-tracker --region us-central1
   ```

---

## Cost Estimate

### Expected Monthly Cost: **$0** (Free Tier)

**Cloud Run Free Tier** (as of 2024):
- 2 million requests/month
- 360,000 GB-seconds of memory
- 180,000 vCPU-seconds
- 1 GB network egress (North America)

**Estimated Usage** (internal tool, \u003c20 active users):
- ~10,000 requests/month
- ~50,000 GB-seconds
- Well within free tier

**If Exceeding Free Tier**:
- Estimated: $1-5/month for moderate usage
- Mainly from instance time and requests

**Secret Manager** (if used):
- $0.06 per 10,000 accesses
- Negligible cost for this use case

---

## Maintenance Plan

### Weekly
- [ ] Check Cloud Run logs for errors
- [ ] Review usage metrics
- [ ] Verify application is accessible

### Monthly
- [ ] Review billing/costs
- [ ] Update dependencies if needed: `npm audit`
- [ ] Check for Cloud Run platform updates

### Quarterly
- [ ] Security audit
- [ ] Performance review
- [ ] User feedback review

### As Needed
- [ ] Redeploy after code changes
- [ ] Scale resources if usage increases
- [ ] Rotate service account keys (annually)

---

## Additional Notes

### Differences from SwiftInvite Deployment

1. **No OAuth**: This app uses service account auth (simpler)
2. **No Database**: Data stored in Google Sheets (no Cloud SQL needed)
3. **Next.js vs FastAPI**: Different build process and runtime
4. **No Session Management**: Read-only data access (no user sessions yet)

### Future Enhancements

1. **Authentication**: Add Google OAuth for multi-user access
2. **Caching**: Implement Redis for Sheets data caching
3. **CDN**: Use Cloud CDN for static assets
4. **Monitoring**: Set up Cloud Monitoring dashboards
5. **Backup**: Schedule automated Sheets backups

---

## Quick Reference Commands

```bash
# Deploy/Update
gcloud run deploy outreach-tracker --source . --region us-central1

# Get service URL
gcloud run services describe outreach-tracker \
  --region us-central1 \
  --format='value(status.url)'

# View logs
gcloud run services logs tail outreach-tracker --region us-central1

# Update environment variables
gcloud run services update outreach-tracker \
  --region us-central1 \
  --set-env-vars "KEY=VALUE"

# View all env vars
gcloud run services describe outreach-tracker \
  --region us-central1 \
  --format='yaml(spec.template.spec.containers[0].env)'

# Check service status
gcloud run services list --region us-central1

# View billing
gcloud billing accounts list
gcloud run services describe outreach-tracker --format='value(metadata.name)'
```

---

**Implementation Plan Version**: 1.0  
**Created**: February 5, 2026  
**Status**: Ready for Review
