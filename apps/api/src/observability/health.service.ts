import {
  loadApiRuntimeConfig,
  sanitizeForLog,
} from '@agentic-support/observability';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import Redis from 'ioredis';
import { ApiShutdownStateService } from '../runtime/api-shutdown-state.service';

type DependencyStatus = {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
};

function toSafeErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) {
    return fallback;
  }

  const sanitized = sanitizeForLog(error.message);
  return typeof sanitized === 'string' && sanitized.trim() ? sanitized : fallback;
}

@Injectable()
export class HealthService {
  private readonly config = loadApiRuntimeConfig();

  constructor(
    private readonly prisma: PrismaService,
    private readonly shutdownState: ApiShutdownStateService,
  ) {}

  getLiveStatus() {
    return {
      status: 'ok',
      service: 'api',
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION ?? 'dev',
      gitSha: process.env.GIT_SHA ?? 'local',
    };
  }

  async getReadyStatus() {
    const [postgres, redis, config] = await Promise.all([
      this.checkPostgres(),
      this.checkRedis(),
      this.checkConfig(),
    ]);

    const status =
      postgres.status === 'up' &&
      redis.status === 'up' &&
      config.status === 'up' &&
      !this.shutdownState.isShuttingDown()
        ? 'ready'
        : 'not_ready';

    return {
      status,
      service: 'api',
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION ?? 'dev',
      gitSha: process.env.GIT_SHA ?? 'local',
      dependencies: {
        postgres,
        redis,
        config,
      },
    };
  }

  private async checkPostgres(): Promise<DependencyStatus> {
    const startedAt = Date.now();
    try {
      await this.withTimeout(this.prisma.$queryRaw`SELECT 1`);
      return { status: 'up', latencyMs: Date.now() - startedAt };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Date.now() - startedAt,
        error: toSafeErrorMessage(error, 'postgres unavailable'),
      };
    }
  }

  private async checkRedis(): Promise<DependencyStatus> {
    const client =
      typeof this.config.redis.connection === 'string'
        ? new Redis(this.config.redis.connection, {
            maxRetriesPerRequest: 0,
            lazyConnect: true,
          })
        : new Redis({
            ...this.config.redis.connection,
            maxRetriesPerRequest: 0,
            lazyConnect: true,
          });
    const startedAt = Date.now();

    try {
      await this.withTimeout(client.connect());
      await this.withTimeout(client.ping());
      return { status: 'up', latencyMs: Date.now() - startedAt };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Date.now() - startedAt,
        error: toSafeErrorMessage(error, 'redis unavailable'),
      };
    } finally {
      client.disconnect();
    }
  }

  private async checkConfig(): Promise<DependencyStatus> {
    if (this.shutdownState.isShuttingDown()) {
      return {
        status: 'down',
        error: 'Shutdown in progress',
      };
    }

    return { status: 'up' };
  }

  private async withTimeout<T>(promise: Promise<T>) {
    const timeoutMs = this.config.healthTimeoutMs;

    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('health timeout')), timeoutMs),
      ),
    ]);
  }
}
