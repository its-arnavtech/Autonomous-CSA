import { HealthService } from './health.service';

const redisState = {
  connect: jest.fn(),
  ping: jest.fn(),
  disconnect: jest.fn(),
};

jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => ({
    connect: redisState.connect,
    ping: redisState.ping,
    disconnect: redisState.disconnect,
  })),
);

describe('Phase 9 API health service', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/app';
    process.env.JWT_ACCESS_SECRET = 'access-secret';
    process.env.JWT_REFRESH_SECRET = 'refresh-secret';
    process.env.HEALTH_CHECK_TIMEOUT_MS = '10';
    redisState.connect.mockResolvedValue(undefined);
    redisState.ping.mockResolvedValue('PONG');
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns live status without dependency checks', () => {
    const prisma = { $queryRaw: jest.fn() };
    const service = new HealthService(prisma as never, {
      isShuttingDown: () => false,
    } as never);

    expect(service.getLiveStatus()).toMatchObject({
      status: 'ok',
      service: 'api',
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('returns ready when Postgres, Redis, and config are healthy', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const service = new HealthService(prisma as never, {
      isShuttingDown: () => false,
    } as never);

    const result = await service.getReadyStatus();

    expect(result.status).toBe('ready');
    expect(result.dependencies.postgres.status).toBe('up');
    expect(result.dependencies.redis.status).toBe('up');
    expect(result.dependencies.config.status).toBe('up');
  });

  it('fails readiness when Postgres is unavailable and does not leak credentials', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockRejectedValue(
          new Error('connect ECONNREFUSED postgresql://postgres:secret@db/app'),
        ),
    };
    const service = new HealthService(prisma as never, {
      isShuttingDown: () => false,
    } as never);

    const result = await service.getReadyStatus();

    expect(result.status).toBe('not_ready');
    expect(result.dependencies.postgres.status).toBe('down');
    expect(result.dependencies.postgres.error).not.toContain('secret');
    expect(result.dependencies.postgres.error).not.toContain('postgresql://');
  });

  it('fails readiness when Redis is unavailable and recovers after Redis is healthy again', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const service = new HealthService(prisma as never, {
      isShuttingDown: () => false,
    } as never);

    redisState.connect.mockRejectedValueOnce(new Error('redis://secret@cache:6379'));
    const failed = await service.getReadyStatus();
    expect(failed.status).toBe('not_ready');
    expect(failed.dependencies.redis.status).toBe('down');
    expect(failed.dependencies.redis.error).not.toContain('secret');

    redisState.connect.mockResolvedValueOnce(undefined);
    redisState.ping.mockResolvedValueOnce('PONG');
    const recovered = await service.getReadyStatus();
    expect(recovered.status).toBe('ready');
    expect(recovered.dependencies.redis.status).toBe('up');
  });

  it('bounds readiness timeouts', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockImplementation(() => new Promise(() => undefined)),
    };
    redisState.connect.mockImplementation(() => new Promise(() => undefined));
    const service = new HealthService(prisma as never, {
      isShuttingDown: () => false,
    } as never);

    const startedAt = Date.now();
    const result = await service.getReadyStatus();
    const elapsedMs = Date.now() - startedAt;

    expect(result.status).toBe('not_ready');
    expect(elapsedMs).toBeLessThan(200);
  });

  it('reports not ready while shutdown is in progress', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const service = new HealthService(prisma as never, {
      isShuttingDown: () => true,
    } as never);

    const result = await service.getReadyStatus();

    expect(result.status).toBe('not_ready');
    expect(result.dependencies.config.error).toBe('Shutdown in progress');
  });
});
