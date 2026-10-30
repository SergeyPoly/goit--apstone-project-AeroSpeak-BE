import { AuthUser, TokenVerificationError, TokenVerifier } from './token-verifier';

/**
 * Test double for TokenVerifier: no network. "expired" is an expired token,
 * a known token maps to its user, anything else is invalid.
 */
export class FakeTokenVerifier extends TokenVerifier {
  constructor(private readonly users: Record<string, AuthUser>) {
    super();
  }

  verify(idToken: string): Promise<AuthUser> {
    if (idToken === 'expired') return Promise.reject(new TokenVerificationError('expired'));
    const user = this.users[idToken];
    return user ? Promise.resolve(user) : Promise.reject(new TokenVerificationError('invalid'));
  }
}
