/** The signed-in user, as stated by a verified ID token. */
export interface AuthUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

/**
 * Verifies the ID token the frontend sends as `Authorization: Bearer <token>`.
 * Abstract so tests can use a fake without network access.
 */
export abstract class TokenVerifier {
  abstract verify(idToken: string): Promise<AuthUser>;
}

/** Thrown for any token that cannot be accepted. */
export class TokenVerificationError extends Error {
  constructor(
    readonly reason: 'expired' | 'invalid',
    options?: { cause?: unknown },
  ) {
    super(`ID token is ${reason}`, options);
    this.name = 'TokenVerificationError';
  }
}
