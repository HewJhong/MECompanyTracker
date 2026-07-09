import { google, sheets_v4 } from 'googleapis';
import { validateEnv } from './env-check';

// Cached across invocations within the same process. Building a GoogleAuth
// client and calling auth.getClient() performs a token exchange with Google's
// OAuth server on every call — reusing the client avoids paying that round
// trip on every request.
let cachedSheetsClient: sheets_v4.Sheets | undefined;

export async function getGoogleSheetsClient() {
    validateEnv();
    if (cachedSheetsClient) {
        return cachedSheetsClient;
    }
  try {
    const scopes = ['https://www.googleapis.com/auth/spreadsheets'];

    // Support newlines in private key if they are escaped in the environment variable
    const privateKey = process.env.GOOGLE_PRIVATE_KEY
      ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
      : undefined;

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: privateKey,
      },
      scopes,
    });

    const client = await auth.getClient();

    // @ts-ignore - The googleapis type definitions can be tricky with auth clients
    const sheets = google.sheets({ version: 'v4', auth: client });

    cachedSheetsClient = sheets;
    return sheets;
  } catch (error) {
    console.error('Error creating Google Sheets client:', error);
    throw new Error('Failed to create Google Sheets client');
  }
}
