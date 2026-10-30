import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { CurrentUser, Public } from './auth.decorators';
import { AuthGuard } from './auth.guard';
import { FakeTokenVerifier } from './testing';
import { AuthUser, TokenVerifier } from './token-verifier';

const alice: AuthUser = {
  uid: 'uid-alice',
  email: 'alice@example.com',
  emailVerified: true,
  name: null,
};

@Controller()
class TestController {
  @Get('private')
  whoAmI(@CurrentUser() user: AuthUser) {
    return { uid: user.uid };
  }

  @Public()
  @Get('public')
  open() {
    return { ok: true };
  }
}

describe('AuthGuard', () => {
  let app: INestApplication;
  let url: string;

  const get = async (path: string, authorization?: string) => {
    const response = await fetch(`${url}${path}`, {
      headers: authorization ? { Authorization: authorization } : {},
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TestController],
      providers: [
        { provide: TokenVerifier, useValue: new FakeTokenVerifier({ 'token-alice': alice }) },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a request without a token', async () => {
    expect(await get('/private')).toMatchObject({ status: 401, body: { code: 'unauthorized' } });
  });

  it('rejects a header that is not a bearer token', async () => {
    expect(await get('/private', 'Basic token-alice')).toMatchObject({
      status: 401,
      body: { code: 'unauthorized' },
    });
  });

  it('rejects an invalid token', async () => {
    expect(await get('/private', 'Bearer forged')).toMatchObject({
      status: 401,
      body: { code: 'unauthorized' },
    });
  });

  it('tells the frontend when the token has expired', async () => {
    expect(await get('/private', 'Bearer expired')).toMatchObject({
      status: 401,
      body: { code: 'token_expired' },
    });
  });

  it('passes the verified user to the route', async () => {
    expect(await get('/private', 'Bearer token-alice')).toEqual({
      status: 200,
      body: { uid: 'uid-alice' },
    });
  });

  it('lets @Public() routes through without a token', async () => {
    expect(await get('/public')).toEqual({ status: 200, body: { ok: true } });
  });
});
