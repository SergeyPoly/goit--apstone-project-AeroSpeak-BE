import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest, IS_PUBLIC_KEY } from './auth.decorators';
import { TokenVerificationError, TokenVerifier } from './token-verifier';

/**
 * Global guard: every route needs `Authorization: Bearer <Firebase ID token>`
 * unless it is marked @Public(). Puts the verified AuthUser on the request.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: TokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException({ code: 'unauthorized', message: 'Sign-in required' });
    }

    try {
      request.user = await this.verifier.verify(token);
    } catch (error) {
      if (!(error instanceof TokenVerificationError)) throw error;
      // The frontend refreshes the token with getIdToken(true) and retries once.
      throw error.reason === 'expired'
        ? new UnauthorizedException({ code: 'token_expired', message: 'ID token has expired' })
        : new UnauthorizedException({ code: 'unauthorized', message: 'Invalid ID token' });
    }
    return true;
  }
}
