import { RateLimitService } from './rate-limit.service';

class FakeRedis {
  status = 'ready';
  private readonly hits = new Map<string, { count: number; expiresAt: number }>();

  async eval(
    _script: string,
    _numberOfKeys: number,
    key: string,
    windowMs: string,
  ) {
    const now = Date.now();
    const ttlWindow = Number.parseInt(windowMs, 10);
    const existing = this.hits.get(key);

    if (!existing || existing.expiresAt <= now) {
      this.hits.set(key, {
        count: 1,
        expiresAt: now + ttlWindow,
      });
      return [1, ttlWindow];
    }

    existing.count += 1;
    return [existing.count, existing.expiresAt - now];
  }

  async quit() {
    return undefined;
  }

  disconnect() {
    return undefined;
  }
}

class ErrorRedis {
  status = 'ready';

  async eval() {
    throw new Error('redis unavailable');
  }

  async quit() {
    return undefined;
  }

  disconnect() {
    return undefined;
  }
}

describe('RateLimitService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/app',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'this-is-a-safe-access-secret-for-tests-123',
      JWT_REFRESH_SECRET: 'this-is-a-safe-refresh-secret-for-tests-456',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
      RATE_LIMIT_AUTH_WINDOW_MS: '1s',
      RATE_LIMIT_AUTH_MAX_ATTEMPTS: '2',
      RATE_LIMIT_API_WINDOW_MS: '1s',
      RATE_LIMIT_API_MAX_REQUESTS: '2',
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('shares auth rate-limit state across service instances', async () => {
    const redis = new FakeRedis();
    const firstService = new RateLimitService();
    const secondService = new RateLimitService();
    (firstService as any).client = redis;
    (secondService as any).client = redis;

    await firstService.assertLoginAllowed('user@example.com', '127.0.0.1');
    await secondService.assertLoginAllowed('user@example.com', '127.0.0.1');

    await expect(
      firstService.assertLoginAllowed('user@example.com', '127.0.0.1'),
    ).rejects.toMatchObject({ status: 429 });
  });

  it('isolates auth keys by login target and client address', async () => {
    const redis = new FakeRedis();
    const service = new RateLimitService();
    (service as any).client = redis;

    await service.assertLoginAllowed('user@example.com', '127.0.0.1');
    await service.assertLoginAllowed('other@example.com', '127.0.0.1');
    await service.assertLoginAllowed('user@example.com', '10.0.0.8');
  });

  it('resets counters after the configured window expires', async () => {
    const redis = new FakeRedis();
    const service = new RateLimitService();
    (service as any).client = redis;

    await service.assertLoginAllowed('user@example.com', '127.0.0.1');
    await service.assertLoginAllowed('user@example.com', '127.0.0.1');
    await expect(
      service.assertLoginAllowed('user@example.com', '127.0.0.1'),
    ).rejects.toMatchObject({ status: 429 });

    await new Promise((resolve) => setTimeout(resolve, 1100));

    await expect(
      service.assertLoginAllowed('user@example.com', '127.0.0.1'),
    ).resolves.toBeUndefined();
  });

  it('fails closed for auth when Redis is unavailable', async () => {
    const service = new RateLimitService();
    (service as any).client = new ErrorRedis();

    await expect(
      service.assertLoginAllowed('user@example.com', '127.0.0.1'),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('fails open for general API rate limiting when Redis is unavailable', async () => {
    const service = new RateLimitService();
    (service as any).client = new ErrorRedis();
    const next = jest.fn();
    const response = {
      setHeader: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await service.applyApiRateLimit(
      {
        path: '/tickets',
        method: 'GET',
        ip: '127.0.0.1',
        header: jest.fn((name: string) =>
          name === 'x-organization-id' ? 'org_123' : undefined,
        ),
      } as any,
      response as any,
      next,
    );

    expect(next).toHaveBeenCalledWith();
    expect(response.status).not.toHaveBeenCalled();
  });
});
