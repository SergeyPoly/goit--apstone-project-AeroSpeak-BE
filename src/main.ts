import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { buildCorsOrigin } from './config/cors';
import type { Env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

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
      .build(),
  );
  SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'api-json' });

  app.enableShutdownHooks();

  const port = Number(config.get('PORT', { infer: true }));
  await app.listen(port, '0.0.0.0');
  Logger.log(`AeroSpeak API listening on port ${port}`, 'Bootstrap');
}

void bootstrap();
