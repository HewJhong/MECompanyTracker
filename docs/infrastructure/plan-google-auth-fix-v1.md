# Google Auth Fix Planning Document (v1)

## 📅 Date & Time of Generation
2026-02-26 22:50:00

## 🎯 Actionable Goal
Resolve the `ERR_OSSL_UNSUPPORTED` error in Google Sheets API calls by correcting the malformed `GOOGLE_PRIVATE_KEY` in environment variables and adding robust parsing logic.

## 💡 Proposed Design / Flow / Architecture
The current initialization of `GoogleAuth` is failing because the `private_key` contains literal quotes and a trailing comma from `.env.local`. 

**The Fix:**
1. **Env Fix**: Remove the trailing comma in `.env.local`.
2. **Code Robustness**: In `lib/google-sheets.ts`, implement a `cleanKey` step that:
   - Removes surrounding double/single quotes.
   - Trims whitespace.
   - Handles escaped newlines (`\n`).

## 🔧 Implementation Details / Key Components
- **File:** `lib/google-sheets.ts`
  - Modify `getGoogleSheetsClient` to sanitize the string.
- **File:** `.env.local`
  - Remove character `,` from line 5.

## ⚖️ Rationale for New Major Version
v1: Initial fix for authentication handshake failure.
