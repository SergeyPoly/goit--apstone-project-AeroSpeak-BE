import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { buildCorsOrigin } from './config/cors';
import type { Env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // Behind Render's proxy every request comes from the proxy address, so without
  // this all users would share one rate-limit counter. A hop count (not `true`)
  // ignores client-supplied X-Forwarded-For entries, so limits cannot be bypassed.
  app.set('trust proxy', Number(config.get('TRUST_PROXY_HOPS', { infer: true })));

  app.enableCors({
    origin: buildCorsOrigin(
      config.get('CORS_ORIGINS', { infer: true }),
      config.get('CORS_ORIGIN_REGEX', { infer: true }),
    ),
  });

  // OpenAPI: UI at /docs, JSON schema at /api-json (used by the frontend to generate types).
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('AeroSpeak API')
      .setDescription('VFR radio phraseology training: scenarios, attempts and scoring.')
      .setVersion('0.1.0')
      // Firebase ID token; in development get one with `npm run dev:token`.
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'api-json' });

  app.enableShutdownHooks();

  const port = Number(config.get('PORT', { infer: true }));
  await app.listen(port, '0.0.0.0');
  Logger.log(`AeroSpeak API listening on port ${port}`, 'Bootstrap');
}

void bootstrap();
