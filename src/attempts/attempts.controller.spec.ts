import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '../auth/auth.guard';
import { FakeTokenVerifier } from '../auth/testing';
import { AuthUser, TokenVerifier } from '../auth/token-verifier';
import { PrismaService } from '../prisma/prisma.service';
import { loadContent } from '../scenarios/content-loader';
import { CONTENT_DIR, ScenariosService } from '../scenarios/scenarios.service';
import { SttProvider, SttRequest, SttResult } from '../stt/stt.provider';
import { AttemptsController } from './attempts.controller';
import { AttemptsService } from './attempts.service';

const scenario = loadContent(CONTENT_DIR).scenarios[0];
const step = scenario.steps[0];

const user = (uid: string): AuthUser => ({ uid, email: null, emailVerified: false, name: null });

/** Answers with the expected phrase. */
class FakeStt extends SttProvider {
  readonly name = 'fake';
  calls = 0;
  transcribe(_request: SttRequest): Promise<SttResult> {
    this.calls++;
    return Promise.resolve({ transcript: step.expectedPilotResponse, provider: this.name });
  }
}

describe('POST /attempts', () => {
  let app: INestApplication;
  let url: string;
  let stt: FakeStt;
  const saved: Array<{ userId: string; scenarioId: string; stepId: string }> = [];

  const profiles: Record<string, { id: string; termsAcceptedAt: Date | null }> = {
    'uid-registered': { id: 'user-1', termsAcceptedAt: new Date() },
    'uid-no-terms': { id: 'user-2', termsAcceptedAt: null },
  };
  const prisma = {
    user: {
      findUnique: ({ where }: { where: { firebaseUid: string } }) =>
        Promise.resolve(profiles[where.firebaseUid] ?? null),
    },
    attempt: {
      create: ({ data }: { data: (typeof saved)[number] }) => {
        saved.push(data);
        return Promise.resolve({ id: 'attempt-1' });
      },
    },
  };

  const post = async (token?: string) => {
    const form = new FormData();
    form.append('audio', new Blob([new Uint8Array(16)], { type: 'audio/webm' }), 'a.webm');
    form.append('scenarioId', scenario.id);
    form.append('stepId', step.id);
    const response = await fetch(`${url}/attempts`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };

  beforeEach(async () => {
    stt = new FakeStt();
    saved.length = 0;
    const moduleRef = await Test.createTestingModule({
      controllers: [AttemptsController],
      providers: [
        AttemptsService,
        ScenariosService,
        { provide: PrismaService, useValue: prisma },
        { provide: SttProvider, useValue: stt },
        {
          provide: TokenVerifier,
          useValue: new FakeTokenVerifier({
            'token-registered': user('uid-registered'),
            'token-no-terms': user('uid-no-terms'),
            'token-new': user('uid-new'),
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
    expect(await post()).toMatchObject({ status: 401, body: { code: 'unauthorized' } });
  });

  it('needs a profile', async () => {
    expect(await post('token-new')).toMatchObject({
      status: 403,
      body: { code: 'profile_not_found' },
    });
    expect(stt.calls).toBe(0);
  });

  it('needs accepted terms', async () => {
    expect(await post('token-no-terms')).toMatchObject({
      status: 403,
      body: { code: 'terms_not_accepted' },
    });
    expect(stt.calls).toBe(0);
  });

  it('scores the attempt and saves it for the user', async () => {
    const { status, body } = await post('token-registered');
    expect(status).toBe(201);
    expect(body.attemptId).toBe('attempt-1');
    expect(typeof body.score).toBe('number');
    expect(saved).toEqual([
      expect.objectContaining({ userId: 'user-1', scenarioId: scenario.id, stepId: step.id }),
    ]);
  });
});
