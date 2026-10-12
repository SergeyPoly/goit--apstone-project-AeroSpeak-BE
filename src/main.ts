import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import type { Env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  const allowedOrigins = config.get('CORS_ORIGINS', { infer: true });
  const originRegex = config.get('CORS_ORIGIN_REGEX', { infer: true });
  app.enableCors({
    origin: (origin, callback) => {
      // Requests without Origin (curl, health checks) are allowed.
      if (!origin || allowedOrigins.includes(origin) || originRegex?.test(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
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

  const port = config.get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
  Logger.log(`AeroSpeak API listening on port ${port}`, 'Bootstrap');
}

void bootstrap();
