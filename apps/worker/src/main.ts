import { NestFactory } from '@nestjs/core';
import { bindCorrelationContext } from '@agentic-support/observability';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { workerLogger } from './observability/worker-logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger: workerLogger,
  });
  app.useLogger(workerLogger);
  app.use((req: Request, res: Response, next: NextFunction) => {
    bindCorrelationContext(req, res, next);
  });
  const rawPort = process.env.PORT;
  const port = rawPort ? parseInt(rawPort, 10) : 3002;
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }
  await app.listen(port);
  workerLogger.log(`Worker listening on http://localhost:${port}`, { port });
}
void bootstrap();
