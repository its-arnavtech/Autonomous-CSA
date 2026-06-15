import { Injectable } from '@nestjs/common';
import { sanitizeForLog } from '@agentic-support/observability';
import { PrismaService } from '../prisma/prisma.service';
import Redis from 'ioredis';

type DependencyStatus = {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
};

function getHealthTimeoutMs() {
  const parsed = Number.parseInt(
    process.env.HEALTH_CHECK_TIMEOUT_MS?.trim() ?? '2000',
    10,
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2000;
}

function getRedisPort() {
  const parsed = Number.parseInt(process.env.REDIS_PORT?.trim() ?? '6379', 10);
  return Number.isFinite(parsed) ? parsed : 6379;
}

function toSafeErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) {
    return fallback;
  }

  const sanitized = sanitizeForLog(error.message);
  return typeof sanitized === 'string' && sanitized.trim() ? sanitized : fallback;
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

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
      config.status === 'up'
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
    const client = new Redis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: getRedisPort(),
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
    const required = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
    const missing = required.filter((key) => !process.env[key]?.trim());

    return missing.length === 0
      ? { status: 'up' }
      : {
          status: 'down',
          error: `Missing required config: ${missing.join(', ')}`,
        };
  }

  private async withTimeout<T>(promise: Promise<T>) {
    const timeoutMs = getHealthTimeoutMs();

    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('health timeout')), timeoutMs),
      ),
    ]);
  }
}
