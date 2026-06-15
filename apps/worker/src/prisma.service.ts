import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@agentic-support/db';
import { workerLogger } from './observability/worker-logger';

type PrismaQueryEvent = {
  duration: number;
  target: string;
  query: string;
};

type PrismaLogEvent = {
  message: string;
  target: string;
};

function getSlowQueryThresholdMs() {
  const parsed = Number.parseInt(
    process.env.DB_SLOW_QUERY_MS?.trim() ?? '250',
    10,
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 250;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
  }

  async onModuleInit() {
    const slowQueryThresholdMs = getSlowQueryThresholdMs();

    this.$on('query' as never, (event: PrismaQueryEvent) => {
      if (event.duration < slowQueryThresholdMs) {
        return;
      }

      workerLogger.warn('Slow Prisma query detected', {
        durationMs: event.duration,
        target: event.target,
        querySummary: event.query.slice(0, 120),
      });
    });

    this.$on('warn' as never, (event: PrismaLogEvent) => {
      workerLogger.warn('Prisma warning', {
        message: event.message,
        target: event.target,
      });
    });

    this.$on('error' as never, (event: PrismaLogEvent) => {
      workerLogger.error('Prisma error', {
        message: event.message,
        target: event.target,
      });
    });

    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
