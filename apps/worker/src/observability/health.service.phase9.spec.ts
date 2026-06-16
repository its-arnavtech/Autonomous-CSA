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

describe('Phase 9 worker health service', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/app';
    process.env.HEALTH_CHECK_TIMEOUT_MS = '10';
    redisState.connect.mockResolvedValue(undefined);
    redisState.ping.mockResolvedValue('PONG');
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('matches the API health payload shape for live checks', () => {
    const prisma = { $queryRaw: jest.fn() };
    const service = new HealthService(prisma as never, {
      isShuttingDown: () => false,
    } as never);

    expect(service.getLiveStatus()).toMatchObject({
      status: 'ok',
      service: 'worker',
      version: expect.any(String),
      gitSha: expect.any(String),
    });
  });

  it('returns ready when dependencies are healthy', async () => {
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

  it('fails readiness when Redis is unavailable', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    redisState.connect.mockRejectedValue(new Error('redis://secret@cache:6379'));
    const service = new HealthService(prisma as never, {
      isShuttingDown: () => false,
    } as never);

    const result = await service.getReadyStatus();

    expect(result.status).toBe('not_ready');
    expect(result.dependencies.redis.status).toBe('down');
    expect(result.dependencies.redis.error).not.toContain('secret');
  });

  it('reports shutdown as not ready', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const service = new HealthService(prisma as never, {
      isShuttingDown: () => true,
    } as never);

    const result = await service.getReadyStatus();

    expect(result.status).toBe('not_ready');
    expect(result.dependencies.config.error).toBe('Shutdown in progress');
  });
});
