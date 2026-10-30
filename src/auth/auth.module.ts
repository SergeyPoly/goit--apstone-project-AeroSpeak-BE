import { Module } from '@nestjs/common';
import { FirebaseTokenVerifier } from './firebase-token-verifier';
import { TokenVerifier } from './token-verifier';

/**
 * Binds the abstract TokenVerifier to Firebase. AuthGuard itself is registered
 * as a global guard in AppModule, after the rate limiter.
 */
@Module({
  providers: [{ provide: TokenVerifier, useClass: FirebaseTokenVerifier }],
  exports: [TokenVerifier],
})
export class AuthModule {}
