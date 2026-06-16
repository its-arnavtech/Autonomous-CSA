import { NestFactory } from '@nestjs/core';
import {
  bindCorrelationContext,
  loadWorkerRuntimeConfig,
} from '@agentic-support/observability';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { workerLogger } from './observability/worker-logger';
import { SupportProcessor } from './support.processor';
import { WorkerShutdownStateService } from './runtime/worker-shutdown-state.service';

async function bootstrap() {
  const config = loadWorkerRuntimeConfig();
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger: workerLogger,
  });
  app.useLogger(workerLogger);
  app.enableShutdownHooks();
  app.use((req: Request, res: Response, next: NextFunction) => {
    bindCorrelationContext(req, res, next);
  });
  await app.listen(config.port);
  workerLogger.log(`Worker listening on http://localhost:${config.port}`, {
    port: config.port,
  });

  const processor = app.get(SupportProcessor);
  const shutdownState = app.get(WorkerShutdownStateService);
  let shuttingDown = false;
  const handleShutdown = async (signal: 'SIGINT' | 'SIGTERM') => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    shutdownState.beginShutdown(signal);
    workerLogger.warn('Worker shutdown requested', { signal });

    const timeout = setTimeout(() => {
      workerLogger.error('Worker shutdown exceeded grace period', {
        signal,
        shutdownGraceMs: config.shutdownGraceMs,
      });
      process.exit(1);
    }, config.shutdownGraceMs);
    timeout.unref();

    try {
      await processor.worker.close();
      await app.close();
      clearTimeout(timeout);
      process.exit(0);
    } catch (error) {
      workerLogger.error('Worker shutdown failed', error, { signal });
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
