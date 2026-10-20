import { Controller, Get } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

/**
 * Rate limits are keyed by req.ip. In this test the loopback socket plays the
 * role of Render's proxy: it is the one trusted hop, and X-Forwarded-For carries
 * what the proxy reported about the client.
 */
@Controller()
class PingController {
  @Get('ping')
  ping() {
    return 'pong';
  }
}

async function startApp(trustProxyHops: number) {
  const moduleRef = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 2 }])],
    controllers: [PingController],
    providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  app.set('trust proxy', trustProxyHops);
  await app.listen(0, '127.0.0.1');
  return app;
}

describe('trust proxy and rate limits', () => {
  let app: NestExpressApplication;
  let url: string;

  const ping = async (forwardedFor: string) => {
    const response = await fetch(url, { headers: { 'X-Forwarded-For': forwardedFor } });
    return response.status;
  };

  afterEach(async () => {
    await app.close();
  });

  describe('with one trusted hop', () => {
    beforeEach(async () => {
      app = await startApp(1);
      url = `${await app.getUrl()}/ping`;
    });

    it('gives each client its own limit', async () => {
      expect(await ping('89.64.0.1')).toBe(200);
      expect(await ping('89.64.0.1')).toBe(200);
      expect(await ping('89.64.0.1')).toBe(429);
      expect(await ping('89.64.0.2')).toBe(200);
    });

    it('ignores addresses the client put into X-Forwarded-For itself', async () => {
      expect(await ping('1.1.1.1, 89.64.0.1')).toBe(200);
      expect(await ping('2.2.2.2, 89.64.0.1')).toBe(200);
      expect(await ping('3.3.3.3, 89.64.0.1')).toBe(429);
    });
  });

  describe('without trust proxy', () => {
    beforeEach(async () => {
      app = await startApp(0);
      url = `${await app.getUrl()}/ping`;
    });

    it('counts every client as the proxy address (the bug this setting fixes)', async () => {
      expect(await ping('89.64.0.1')).toBe(200);
      expect(await ping('89.64.0.2')).toBe(200);
      expect(await ping('89.64.0.3')).toBe(429);
    });
  });
});
