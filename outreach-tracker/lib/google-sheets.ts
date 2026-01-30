import { google } from 'googleapis';

export async function getGoogleSheetsClient() {
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
    
    return sheets;
  } catch (error) {
    console.error('Error creating Google Sheets client:', error);
    throw new Error('Failed to create Google Sheets client');
  }
}
