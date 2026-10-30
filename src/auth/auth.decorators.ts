import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from './token-verifier';

export const IS_PUBLIC_KEY = 'isPublic';

/** Skips the global AuthGuard for a controller or route. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export type AuthenticatedRequest = Request & { user?: AuthUser };

/** The user verified by AuthGuard. Not available on @Public() routes. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user) throw new Error('@CurrentUser() needs a route protected by AuthGuard');
    return user;
  },
);
