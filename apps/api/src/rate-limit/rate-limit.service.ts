import { createHash } from 'crypto';
import {
  CORRELATION_ID_HEADER,
  loadApiRuntimeConfig,
} from '@agentic-support/observability';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import Redis from 'ioredis';
import { MetricsService } from '../observability/metrics.service';

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAfterMs: number;
  degraded: boolean;
};

type RedisLike = {
  status?: string;
  connect?: () => Promise<unknown>;
  disconnect?: () => void;
  quit?: () => Promise<unknown>;
  eval: (...args: unknown[]) => Promise<unknown>;
};

const noopMetrics = {
  incrementAuthFailure: () => undefined,
} satisfies Pick<MetricsService, 'incrementAuthFailure'>;

const RATE_LIMIT_SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {hits, ttl}
`;

const SKIPPED_GENERAL_LIMIT_PREFIXES = [
  '/health',
  '/metrics',
  '/docs',
  '/auth',
];

@Injectable()
export class RateLimitService {
  private readonly config = loadApiRuntimeConfig();
  private client: RedisLike | Redis | null = null;

  constructor(
    @Optional()
    @Inject(MetricsService)
    private readonly metrics: MetricsService = noopMetrics as unknown as MetricsService,
  ) {}

  async applyApiRateLimit(
    request: Request,
    response: Response,
    next: NextFunction,
  ) {
    if (this.shouldSkipGeneralLimit(request.path)) {
      next();
      return;
    }

    try {
      const routeBucket = this.toRouteBucket(request.path);
      const result = await this.consume({
        namespace: 'api',
        segments: [
          routeBucket,
          request.method.toUpperCase(),
          request.ip ?? 'unknown',
          request.header('x-organization-id') ?? 'anonymous',
        ],
        limit: this.config.rateLimit.api.maxRequests,
        windowMs: this.config.rateLimit.api.windowMs,
        failMode: this.config.rateLimit.api.failMode,
      });

      response.setHeader(
        'x-ratelimit-limit',
        String(this.config.rateLimit.api.maxRequests),
      );
      response.setHeader('x-ratelimit-remaining', String(result.remaining));
      response.setHeader(
        'x-ratelimit-reset-ms',
        String(Math.max(result.resetAfterMs, 0)),
      );

      if (!result.allowed) {
        response
          .status(HttpStatus.TOO_MANY_REQUESTS)
          .setHeader(
            CORRELATION_ID_HEADER,
            request.header(CORRELATION_ID_HEADER) ?? 'rate-limit',
          )
          .json({
            error: 'Too many requests. Please try again later.',
            correlationId:
              request.header(CORRELATION_ID_HEADER) ?? 'rate-limit',
          });
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  }

  async assertLoginAllowed(email: string, ipAddress?: string | null) {
    const result = await this.consume({
      namespace: 'auth',
      segments: [email.trim().toLowerCase(), ipAddress ?? 'unknown'],
      limit: this.config.rateLimit.auth.maxAttempts,
      windowMs: this.config.rateLimit.auth.windowMs,
      failMode: this.config.rateLimit.auth.failMode,
    });

    if (!result.allowed) {
      this.metrics.incrementAuthFailure('login', 'rate_limited');
      throw new HttpException(
        'Too many login attempts. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async shutdown() {
    if (!this.client) {
      return;
    }

    try {
      await this.client.quit?.();
    } finally {
      this.client.disconnect?.();
      this.client = null;
    }
  }

  private async consume(input: {
    namespace: 'auth' | 'api';
    segments: string[];
    limit: number;
    windowMs: number;
    failMode: 'open' | 'closed';
  }): Promise<RateLimitResult> {
    try {
      const client = await this.getClient();
      const key = this.buildKey(input.namespace, input.segments);
      const [rawHits, rawTtl] = (await client.eval(
        RATE_LIMIT_SCRIPT,
        1,
        key,
        String(input.windowMs),
      )) as [number | string, number | string];
      const hits = Number(rawHits);
      const ttl = Number(rawTtl);

      return {
        allowed: hits <= input.limit,
        remaining: Math.max(input.limit - hits, 0),
        resetAfterMs: ttl > 0 ? ttl : input.windowMs,
        degraded: false,
      };
    } catch (error) {
      if (input.failMode === 'open') {
        return {
          allowed: true,
          remaining: input.limit,
          resetAfterMs: input.windowMs,
          degraded: true,
        };
      }

      throw new ServiceUnavailableException('Rate limiting is temporarily unavailable');
    }
  }

  private async getClient() {
    if (!this.client) {
      this.client =
        typeof this.config.redis.connection === 'string'
          ? new Redis(this.config.redis.connection, {
              lazyConnect: true,
              maxRetriesPerRequest: 0,
              enableOfflineQueue: false,
            })
          : new Redis({
              ...this.config.redis.connection,
              lazyConnect: true,
              maxRetriesPerRequest: 0,
              enableOfflineQueue: false,
            });
    }

    const client = this.client;
    if (client.status === 'wait') {
      await client.connect?.();
    }

    return client;
  }

  private buildKey(namespace: 'auth' | 'api', segments: string[]) {
    const digest = createHash('sha256')
      .update(segments.join('|'))
      .digest('hex');

    return `rate-limit:${namespace}:${digest}`;
  }

  private shouldSkipGeneralLimit(path: string) {
    return SKIPPED_GENERAL_LIMIT_PREFIXES.some((prefix) => path.startsWith(prefix));
  }

  private toRouteBucket(path: string) {
    const segments = path
      .split('/')
      .filter(Boolean)
      .slice(0, 2)
      .map((segment) =>
        /^[0-9a-f-]{8,}$/i.test(segment) ? ':id' : segment.toLowerCase(),
      );

    return segments.length === 0 ? 'root' : segments.join('/');
  }
}
