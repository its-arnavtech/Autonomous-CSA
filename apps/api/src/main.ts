import { ValidationPipe } from '@nestjs/common';
import {
  bindCorrelationContext,
  loadApiRuntimeConfig,
} from '@agentic-support/observability';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Express, NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { RateLimitService } from './rate-limit/rate-limit.service';
import { ApiShutdownStateService } from './runtime/api-shutdown-state.service';
import { apiLogger } from './observability/api-logger';

async function bootstrap() {
  const config = loadApiRuntimeConfig();
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger: apiLogger,
  });
  app.useLogger(apiLogger);
  app.enableShutdownHooks();
  (app.getHttpAdapter().getInstance() as Express).set(
    'trust proxy',
    config.trustProxy,
  );
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      frameguard: { action: 'deny' },
      hsts: config.isProduction
        ? {
            maxAge: 60 * 60 * 24 * 180,
            includeSubDomains: true,
          }
        : false,
      noSniff: true,
      permittedCrossDomainPolicies: { permittedPolicies: 'none' },
      referrerPolicy: { policy: 'no-referrer' },
      xDnsPrefetchControl: { allow: false },
    }),
  );
  app.use((req: Request, res: Response, next: NextFunction) => {
    bindCorrelationContext(req, res, next);
  });
  const rateLimitService = app.get(RateLimitService);
  app.use((req: Request, res: Response, next: NextFunction) => {
    void rateLimitService.applyApiRateLimit(req, res, next);
  });
  app.enableCors({
    origin: config.corsAllowedOrigins,
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

  if (config.swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Agentic Support API')
      .setDescription('REST API for the Agentic AI Customer Support Platform')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(config.port);
  apiLogger.log(`API listening on http://localhost:${config.port}`, {
    port: config.port,
  });

  const shutdownState = app.get(ApiShutdownStateService);
  let shuttingDown = false;
  const handleShutdown = async (signal: 'SIGINT' | 'SIGTERM') => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    shutdownState.beginShutdown(signal);
    apiLogger.warn('API shutdown requested', { signal });

    const timeout = setTimeout(() => {
      apiLogger.error('API shutdown exceeded grace period', {
        signal,
        shutdownGraceMs: config.shutdownGraceMs,
      });
      process.exit(1);
    }, config.shutdownGraceMs);
    timeout.unref();

    try {
      await app.close();
      await Promise.resolve(
        (app as { flushLogs?: () => unknown }).flushLogs?.(),
      );
      clearTimeout(timeout);
      process.exit(0);
    } catch (error) {
      apiLogger.error('API shutdown failed', error, { signal });
      clearTimeout(timeout);
      process.exit(1);
    }
  };

  process.once('SIGINT', () => {
    void handleShutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void handleShutdown('SIGTERM');
  });
}
void bootstrap();
