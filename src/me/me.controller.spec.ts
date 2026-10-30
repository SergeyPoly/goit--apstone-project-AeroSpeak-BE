import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuthGuard } from '../auth/auth.guard';
import { FakeTokenVerifier } from '../auth/testing';
import { AuthUser, TokenVerifier } from '../auth/token-verifier';
import { PrismaService } from '../prisma/prisma.service';
import { MeController } from './me.controller';
import { MeService } from './me.service';

/** In-memory stand-in for the few Prisma calls MeService makes. */
function fakePrisma() {
  const users: User[] = [];
  const byUid = (uid: string) => users.find((u) => u.firebaseUid === uid) ?? null;
  const touch = (user: User, data: Partial<User>) =>
    Object.assign(user, data, { updatedAt: new Date() });

  return {
    users,
    user: {
      findUnique: ({ where }: { where: { firebaseUid: string } }) =>
        Promise.resolve(byUid(where.firebaseUid)),
      upsert: ({
        where,
        create,
        update,
      }: {
        where: { firebaseUid: string };
        create: Partial<User> & { firebaseUid: string };
        update: Partial<User>;
      }) => {
        const existing = byUid(where.firebaseUid);
        if (existing) return Promise.resolve(touch(existing, update));
        const user: User = {
          id: randomUUID(),
          email: null,
          name: null,
          emailVerified: false,
          termsAcceptedAt: null,
          voiceConsentAt: null,
          passwordHash: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...create,
        };
        users.push(user);
        return Promise.resolve(user);
      },
      update: ({ where, data }: { where: { id: string }; data: Partial<User> }) =>
        Promise.resolve(
          touch(
            users.find((u) => u.id === where.id)!,
            data,
          ),
        ),
      deleteMany: ({ where }: { where: { firebaseUid: string } }) => {
        const index = users.findIndex((u) => u.firebaseUid === where.firebaseUid);
        if (index >= 0) users.splice(index, 1);
        return Promise.resolve({ count: index >= 0 ? 1 : 0 });
      },
    },
  };
}

const alice: AuthUser = {
  uid: 'uid-alice',
  email: 'alice@example.com',
  emailVerified: false,
  name: 'Alice from Google',
};

describe('/me', () => {
  let app: INestApplication;
  let url: string;
  let prisma: ReturnType<typeof fakePrisma>;
  let tokenUser: AuthUser;

  const call = async (method: string, path: string, body?: unknown) => {
    const response = await fetch(`${url}${path}`, {
      method,
      headers: { Authorization: 'Bearer token-alice', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return {
      status: response.status,
      body: (text ? JSON.parse(text) : undefined) as Record<string, unknown>,
    };
  };

  beforeEach(async () => {
    prisma = fakePrisma();
    tokenUser = { ...alice };
    const moduleRef = await Test.createTestingModule({
      controllers: [MeController],
      providers: [
        MeService,
        { provide: PrismaService, useValue: prisma },
        // Reads tokenUser on every call, so a test can change what the token says.
        {
          provide: TokenVerifier,
          useValue: new FakeTokenVerifier({
            get 'token-alice'() {
              return tokenUser;
            },
          }),
        },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });

  afterEach(async () => {
    await app.close();
  });

  it('needs a token', async () => {
    const response = await fetch(`${url}/me`);
    expect(response.status).toBe(401);
  });

  it('returns 404 profile_not_found before registration', async () => {
    expect(await call('GET', '/me')).toMatchObject({
      status: 404,
      body: { code: 'profile_not_found' },
    });
  });

  it.each([{}, { acceptTerms: false }, { acceptTerms: 'true' }, { acceptTerms: true, name: '' }])(
    'rejects registration body %j',
    async (body) => {
      expect((await call('POST', '/me', body)).status).toBe(400);
      expect(prisma.users).toHaveLength(0);
    },
  );

  it('creates the profile from the token and the body', async () => {
    const { status, body } = await call('POST', '/me', { acceptTerms: true, name: ' Alice ' });
    expect(status).toBe(200);
    expect(body).toMatchObject({
      email: 'alice@example.com',
      name: 'Alice',
      emailVerified: false,
      voiceConsentAt: null,
    });
    expect(body.termsAcceptedAt).toEqual(expect.any(String));
    expect(prisma.users[0].firebaseUid).toBe('uid-alice');
  });

  it('takes the name from the token when the body has none', async () => {
    expect((await call('POST', '/me', { acceptTerms: true })).body.name).toBe('Alice from Google');
  });

  it('keeps the first termsAcceptedAt when registration is repeated', async () => {
    const first = await call('POST', '/me', { acceptTerms: true });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await call('POST', '/me', { acceptTerms: true, name: 'Alice' });
    expect(second.body.termsAcceptedAt).toBe(first.body.termsAcceptedAt);
    expect(second.body.name).toBe('Alice');
    expect(prisma.users).toHaveLength(1);
  });

  it('refreshes email data from the token on GET', async () => {
    await call('POST', '/me', { acceptTerms: true });
    tokenUser = { ...alice, email: 'alice@new.example.com', emailVerified: true };
    expect((await call('GET', '/me')).body).toMatchObject({
      email: 'alice@new.example.com',
      emailVerified: true,
    });
  });

  it('records voice consent once', async () => {
    expect((await call('POST', '/me/voice-consent')).status).toBe(404);
    await call('POST', '/me', { acceptTerms: true });
    const first = await call('POST', '/me/voice-consent');
    expect(first.status).toBe(200);
    expect(first.body.voiceConsentAt).toEqual(expect.any(String));
    const second = await call('POST', '/me/voice-consent');
    expect(second.body.voiceConsentAt).toBe(first.body.voiceConsentAt);
  });

  it('deletes the profile', async () => {
    await call('POST', '/me', { acceptTerms: true });
    expect((await call('DELETE', '/me')).status).toBe(204);
    expect((await call('GET', '/me')).status).toBe(404);
    expect((await call('DELETE', '/me')).status).toBe(204);
  });
});
