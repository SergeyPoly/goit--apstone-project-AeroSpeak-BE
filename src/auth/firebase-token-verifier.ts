import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type Auth, type DecodedIdToken } from 'firebase-admin/auth';
import type { Env } from '../config/env';
import { AuthUser, TokenVerificationError, TokenVerifier } from './token-verifier';

/** A named app, so it never clashes with a default app (tests, other code). */
const APP_NAME = 'aerospeak-auth';

/**
 * Verifies Firebase ID tokens. Only the project id is needed: the SDK checks the
 * signature against Google's public keys, which it fetches and caches itself.
 * No service-account key is involved.
 */
@Injectable()
export class FirebaseTokenVerifier extends TokenVerifier {
  private readonly auth: Auth;

  constructor(config: ConfigService<Env, true>) {
    super();
    const app =
      getApps().find((a) => a.name === APP_NAME) ??
      initializeApp({ projectId: config.get('FIREBASE_PROJECT_ID', { infer: true }) }, APP_NAME);
    this.auth = getAuth(app);
  }

  async verify(idToken: string): Promise<AuthUser> {
    let decoded: DecodedIdToken;
    try {
      decoded = await this.auth.verifyIdToken(idToken);
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      throw new TokenVerificationError(code === 'auth/id-token-expired' ? 'expired' : 'invalid', {
        cause: error,
      });
    }
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      emailVerified: decoded.email_verified ?? false,
      name: typeof decoded.name === 'string' ? decoded.name : null,
    };
  }
}
