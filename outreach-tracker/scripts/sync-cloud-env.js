#!/usr/bin/env node
/**
 * Sync .env.local to Cloud Run env vars and Secret Manager.
 * Run from outreach-tracker/: node scripts/sync-cloud-env.js
 *
 * Cloud Run uses Secret Manager for: GOOGLE_PRIVATE_KEY, GOOGLE_OAUTH_CLIENT_SECRET, NEXTAUTH_SECRET
 * Plain env vars for: GOOGLE_SERVICE_ACCOUNT_EMAIL, SPREADSHEET_ID_1, SPREADSHEET_ID_2,
 *   GOOGLE_OAUTH_CLIENT_ID, NEXTAUTH_URL
 *
 * Usage: node scripts/sync-cloud-env.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const OUTREACH_DIR = path.join(__dirname, '..');
const ENV_LOCAL = path.join(OUTREACH_DIR, '.env.local');

const PROJECT = process.env.GCLOUD_PROJECT || 'company-tracker-485803';
const REGION = process.env.GCLOUD_REGION || 'us-central1';
const SERVICE = 'outreach-tracker';

const SECRET_MAP = {
  GOOGLE_PRIVATE_KEY: 'google-sheets-private-key',
  GOOGLE_OAUTH_CLIENT_SECRET: 'google-oauth-client-secret',
  NEXTAUTH_SECRET: 'nextauth-secret',
};

const PLAIN_ENV_KEYS = [
  'GOOGLE_SERVICE_ACCOUNT_EMAIL',
  'SPREADSHEET_ID_1',
  'SPREADSHEET_ID_2',
  'GOOGLE_OAUTH_CLIENT_ID',
  'NEXTAUTH_URL',
];

function parseEnvLocal(content) {
  const vars = {};
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    let key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // Strip inline comment
    const hashIdx = value.indexOf(' #');
    if (hashIdx !== -1) value = value.slice(0, hashIdx).trim();
    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!key) continue;
    vars[key] = value;
  }
  return vars;
}

function generateNextAuthSecret() {
  return execSync('openssl rand -base64 32', { encoding: 'utf8' }).trim();
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (!fs.existsSync(ENV_LOCAL)) {
    console.error('Missing .env.local at', ENV_LOCAL);
    process.exit(1);
  }
  const content = fs.readFileSync(ENV_LOCAL, 'utf8');
  const vars = parseEnvLocal(content);
  // Generate NEXTAUTH_SECRET if it's the placeholder
  if (!vars.NEXTAUTH_SECRET || vars.NEXTAUTH_SECRET.includes('openssl')) {
    vars.NEXTAUTH_SECRET = generateNextAuthSecret();
  }
  // Force prod NEXTAUTH_URL
  vars.NEXTAUTH_URL = 'https://outreach-tracker-8073712255.us-central1.run.app';
  // Clean spreadsheet IDs (strip any trailing comment)
  if (vars.SPREADSHEET_ID_1) vars.SPREADSHEET_ID_1 = vars.SPREADSHEET_ID_1.trim();
  if (vars.SPREADSHEET_ID_2) vars.SPREADSHEET_ID_2 = vars.SPREADSHEET_ID_2.trim();

  if (dryRun) {
    console.log('Would update:\n');
    console.log('Secrets (Secret Manager):');
    for (const [envKey, secretName] of Object.entries(SECRET_MAP)) {
      const v = vars[envKey];
      console.log(`  ${secretName} <- ${v ? `[${v.length} chars]` : '(empty)'}`);
    }
    console.log('\nPlain env vars:');
    for (const key of PLAIN_ENV_KEYS) {
      console.log(`  ${key}=${vars[key] || '(not set)'}`);
    }
    return;
  }

  // 1. Update Secret Manager secrets
  for (const [envKey, secretName] of Object.entries(SECRET_MAP)) {
    const value = vars[envKey];
    if (!value) {
      console.warn(`Skip ${secretName}: no value in .env.local`);
      continue;
    }
    console.log('Updating secret %s...', secretName);
    const tmpFile = path.join(require('os').tmpdir(), `secret-${secretName}-${Date.now()}`);
    fs.writeFileSync(tmpFile, value, 'utf8');
    try {
      execSync(
        `gcloud secrets versions add ${secretName} --project ${PROJECT} --data-file="${tmpFile}"`,
        { stdio: 'pipe' }
      );
    } finally {
      try {
        fs.unlinkSync(tmpFile);
      } catch (_) {}
    }
  }

  // 2. Update plain env vars on Cloud Run
  const updateVars = PLAIN_ENV_KEYS
    .filter((k) => vars[k])
    .map((k) => `${k}=${vars[k]}`)
    .join(',');
  if (updateVars) {
    console.log('Updating Cloud Run plain env vars...');
    execSync(
      `gcloud run services update ${SERVICE} --project ${PROJECT} --region ${REGION} --update-env-vars "${updateVars}"`,
      { stdio: 'inherit' }
    );
  }
  console.log('Done. Env vars and secrets synced from .env.local');
}

main();
