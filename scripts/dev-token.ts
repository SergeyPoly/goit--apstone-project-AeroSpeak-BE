/**
 * Prints a Firebase ID token for a test user, to paste into Swagger "Authorize" (/docs).
 *
 *   npm run dev:token -- <email> <password>
 *
 * Signs in through the Firebase Auth REST API with FIREBASE_WEB_API_KEY from .env
 * (dev only; the app itself does not use it). The user must exist in Firebase with
 * the email/password provider. Tokens are valid for one hour.
 */
import { join } from 'node:path';

try {
  process.loadEnvFile(join(__dirname, '..', '.env'));
} catch {
  // No .env: rely on the environment.
}

interface SignInResponse {
  idToken?: string;
  error?: { message: string };
}

async function main() {
  const [email, password] = process.argv.slice(2);
  const apiKey = process.env.FIREBASE_WEB_API_KEY;
  if (!email || !password) throw new Error('Usage: npm run dev:token -- <email> <password>');
  if (!apiKey)
    throw new Error('Set FIREBASE_WEB_API_KEY in .env (Firebase console > Project settings)');

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  const body = (await response.json()) as SignInResponse;
  if (!response.ok || !body.idToken) {
    throw new Error(`Sign-in failed: ${body.error?.message ?? response.status}`);
  }
  console.log(body.idToken);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
