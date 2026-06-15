import { ValidationPipe } from '@nestjs/common';
import { bindCorrelationContext } from '@agentic-support/observability';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { apiLogger } from './observability/api-logger';

function parseAllowedOrigins() {
  const raw = process.env.CORS_ALLOWED_ORIGINS?.trim();

  if (!raw) {
    return process.env.NODE_ENV === 'production'
      ? []
      : ['http://localhost:3000'];
  }

  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger: apiLogger,
  });
  app.useLogger(apiLogger);
  app.use(helmet());
  app.use((req: Request, res: Response, next: NextFunction) => {
    bindCorrelationContext(req, res, next);
  });
  app.enableCors({
    origin: parseAllowedOrigins(),
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'content-type',
      'authorization',
      'x-organization-id',
      'x-correlation-id',
    ],
    exposedHeaders: ['x-correlation-id'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerEnabled =
    process.env.SWAGGER_ENABLED === 'true' ||
    (process.env.SWAGGER_ENABLED == null &&
      process.env.NODE_ENV !== 'production');

  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Agentic Support API')
      .setDescription('REST API for the Agentic AI Customer Support Platform')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  const rawPort = process.env.PORT;
  const port = rawPort ? parseInt(rawPort, 10) : 3001;
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }
  await app.listen(port);
  apiLogger.log(`API listening on http://localhost:${port}`, {
    port,
  });
}
void bootstrap();
