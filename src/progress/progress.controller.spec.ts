import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '../auth/auth.guard';
import { FakeTokenVerifier } from '../auth/testing';
import { AuthUser, TokenVerifier } from '../auth/token-verifier';
import { PrismaService } from '../prisma/prisma.service';
import { loadContent } from '../scenarios/content-loader';
import { ScenariosService, CONTENT_DIR } from '../scenarios/scenarios.service';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';

const scenario = loadContent(CONTENT_DIR).scenarios[0];
const user = (uid: string): AuthUser => ({ uid, email: null, emailVerified: false, name: null });

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const row = (n: number, overrides: Record<string, unknown> = {}) => ({
  id: id(n),
  userId: 'user-1',
  createdAt: new Date(Date.UTC(2026, 10, 1, 8, 60 - n)),
  packId: scenario.packId,
  scenarioId: scenario.id,
  stepId: scenario.steps[0].id,
  sessionId: null,
  transcript: 'heard',
  score: 80,
  displayScore: 5,
  success: true,
  missedCritical: [],
  elements: [
    {
      id: 'callsign',
      label: 'Callsign',
      status: 'matched',
      critical: true,
      similarity: 1,
      words: [],
      position: 3,
      issues: 0,
    },
  ],
  expectedPilotResponse: 'expected',
  tip: 'Good transmission.',
  order: null,
  processingMs: 120,
  ...overrides,
});

type Where = { id?: string; userId: string; scenarioId?: string };

describe('progress endpoints', () => {
  let app: INestApplication;
  let url: string;
  let rows: Array<ReturnType<typeof row>>;
  let findManyArgs: Array<Record<string, unknown>>;

  const matches = (where: Where) => (r: ReturnType<typeof row>) =>
    r.userId === where.userId &&
    (!where.id || r.id === where.id) &&
    (!where.scenarioId || r.scenarioId === where.scenarioId);

  const prisma = {
    user: {
      findUnique: ({ where }: { where: { firebaseUid: string } }) =>
        Promise.resolve(where.firebaseUid === 'uid-registered' ? { id: 'user-1' } : null),
    },
    attempt: {
      findFirst: ({ where }: { where: Where }) =>
        Promise.resolve(rows.find(matches(where)) ?? null),
      findMany: (args: { where: Where; take?: number; skip?: number; cursor?: { id: string } }) => {
        findManyArgs.push(args);
        const list = rows.filter(matches(args.where));
        const start = args.cursor ? list.findIndex((r) => r.id === args.cursor?.id) : 0;
        return Promise.resolve(
          list.slice(start + (args.skip ?? 0), args.take ? start + 1 + args.take : undefined),
        );
      },
    },
  };

  const get = async (path: string, token: string | null = 'token-registered') => {
    const response = await fetch(`${url}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return {
      status: response.status,
      body: (await response.json()) as Record<string, unknown> & {
        items: Array<{ id: string }>;
        nextCursor: string | null;
      },
    };
  };

  beforeEach(async () => {
    rows = [];
    findManyArgs = [];
    const moduleRef = await Test.createTestingModule({
      controllers: [ProgressController],
      providers: [
        ProgressService,
        ScenariosService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: TokenVerifier,
          useValue: new FakeTokenVerifier({
            'token-registered': user('uid-registered'),
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

  const paths = ['/me/progress', '/me/progress/daily', '/me/attempts', `/me/attempts/${id(1)}`];

  it.each(paths)('%s needs a token', async (path) => {
    expect(await get(path, null)).toMatchObject({ status: 401, body: { code: 'unauthorized' } });
  });

  it.each(paths)('%s needs a profile', async (path) => {
    expect(await get(path, 'token-new')).toMatchObject({
      status: 403,
      body: { code: 'profile_not_found' },
    });
  });

  describe('GET /me/progress', () => {
    it('returns the scenarios with attempts and the totals', async () => {
      rows = [row(1, { sessionId: id(100) })];
      const { status, body } = await get('/me/progress');
      expect(status).toBe(200);
      expect(body.totals).toMatchObject({ attempts: 1, successfulPhrases: 1 });
      expect(body.scenarios).toEqual([
        expect.objectContaining({ scenarioId: scenario.id, stepAttempts: 1 }),
      ]);
    });

    it('does not load the large columns', async () => {
      await get('/me/progress');
      expect(Object.keys(findManyArgs[0].select as object).sort()).toEqual(
        ['createdAt', 'scenarioId', 'score', 'sessionId', 'stepId', 'success'].sort(),
      );
    });
  });

  describe('GET /me/progress/daily', () => {
    it('returns the days with attempts', async () => {
      rows = [row(1, { createdAt: new Date() })];
      const { status, body } = await get('/me/progress/daily?days=7&tz=Europe/Warsaw');
      expect(status).toBe(200);
      expect(body).toEqual([expect.objectContaining({ attempts: 1, averageScore: 80 })]);
    });

    it.each(['tz=Mars/Olympus', 'days=0', 'days=366', 'days=abc'])('rejects %s', async (query) => {
      expect((await get(`/me/progress/daily?${query}`)).status).toBe(400);
    });
  });

  describe('GET /me/attempts', () => {
    it('pages through the attempts of the user', async () => {
      rows = [row(1), row(2), row(3), row(4, { userId: 'user-2' })];

      const first = await get('/me/attempts?limit=2');
      expect(first.status).toBe(200);
      expect(first.body.items.map((i) => i.id)).toEqual([id(1), id(2)]);
      expect(first.body.nextCursor).toBe(id(2));

      const last = await get(`/me/attempts?limit=2&cursor=${first.body.nextCursor}`);
      expect(last.body.items.map((i) => i.id)).toEqual([id(3)]);
      expect(last.body.nextCursor).toBeNull();
    });

    it('has no next page when the rows fill the last page exactly', async () => {
      rows = [row(1), row(2)];
      expect((await get('/me/attempts?limit=2')).body.nextCursor).toBeNull();
    });

    it('sorts on a unique order and never loads the elements', async () => {
      await get('/me/attempts');
      expect(findManyArgs[0]).toMatchObject({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 21,
      });
      expect(findManyArgs[0].select).not.toHaveProperty('elements');
    });

    it('filters by scenario', async () => {
      rows = [row(1), row(2, { scenarioId: 'other' })];
      const { body } = await get('/me/attempts?scenarioId=other');
      expect(body.items.map((i) => i.id)).toEqual([id(2)]);
    });

    it.each(['limit=0', 'limit=101', 'limit=abc', 'cursor=not-a-uuid'])(
      'rejects %s',
      async (query) => {
        expect((await get(`/me/attempts?${query}`)).status).toBe(400);
      },
    );

    it("rejects a cursor from someone else's attempt", async () => {
      rows = [row(1), row(2, { userId: 'user-2' })];
      expect(await get(`/me/attempts?cursor=${id(2)}`)).toMatchObject({
        status: 400,
        body: { code: 'invalid_cursor' },
      });
    });
  });

  describe('GET /me/attempts/:id', () => {
    it('returns the saved feedback without the internal fields', async () => {
      const order = { rule: 'call', correct: false, outOfOrder: ['callsign'], lostPoints: 5 };
      rows = [row(1, { order })];
      const { status, body } = await get(`/me/attempts/${id(1)}`);
      expect(status).toBe(200);
      expect(body).toMatchObject({
        attemptId: id(1),
        expectedPilotResponse: 'expected',
        tip: 'Good transmission.',
        orderCorrect: false,
        order,
        feedbackProcessingMs: 120,
      });
      expect((body.elements as object[])[0]).not.toHaveProperty('position');
      expect((body.elements as object[])[0]).not.toHaveProperty('issues');
    });

    it('treats a saved attempt without an order check as correct', async () => {
      rows = [row(1)];
      const { body } = await get(`/me/attempts/${id(1)}`);
      expect(body.orderCorrect).toBe(true);
      expect(body).not.toHaveProperty('order');
    });

    it('leaves out what older attempts did not save', async () => {
      rows = [row(1, { expectedPilotResponse: null, tip: null })];
      const { status, body } = await get(`/me/attempts/${id(1)}`);
      expect(status).toBe(200);
      for (const field of ['expectedPilotResponse', 'tip', 'orderCorrect', 'order']) {
        expect(body).not.toHaveProperty(field);
      }
    });

    it.each([
      ['someone else', id(2)],
      ['a missing id', id(3)],
      ['an id that is not a uuid', 'not-a-uuid'],
    ])('answers 404 for %s', async (_name, attemptId) => {
      rows = [row(1), row(2, { userId: 'user-2' })];
      expect(await get(`/me/attempts/${attemptId}`)).toMatchObject({
        status: 404,
        body: { code: 'attempt_not_found' },
      });
    });
  });
});
