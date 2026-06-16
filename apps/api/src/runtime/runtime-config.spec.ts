import {
  loadApiRuntimeConfig,
  loadWebRuntimeConfig,
  loadWorkerRuntimeConfig,
} from '@agentic-support/observability';

describe('runtime configuration validation', () => {
  it('rejects wildcard production cors origins', () => {
    expect(() =>
      loadApiRuntimeConfig({
        NODE_ENV: 'production',
        PORT: '3001',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/app',
        REDIS_URL: 'redis://localhost:6379',
        JWT_ACCESS_SECRET: 'this-is-a-safe-access-secret-for-tests-123',
        JWT_REFRESH_SECRET: 'this-is-a-safe-refresh-secret-for-tests-456',
        CORS_ALLOWED_ORIGINS: '*',
        METRICS_AUTH_TOKEN: 'metrics-token',
      }),
    ).toThrow(/CORS_ALLOWED_ORIGINS/);
  });

  it('rejects insecure production cookie settings', () => {
    expect(() =>
      loadWebRuntimeConfig({
        NODE_ENV: 'production',
        API_BASE_URL: 'https://api.example.com',
        AUTH_COOKIE_SECURE: 'false',
        AUTH_COOKIE_SAME_SITE: 'none',
        JWT_ACCESS_TTL: '15m',
        JWT_REFRESH_TTL: '7d',
      }),
    ).toThrow(/AUTH_COOKIE_SECURE/);
  });

  it('rejects placeholder production JWT secrets', () => {
    expect(() =>
      loadApiRuntimeConfig({
        NODE_ENV: 'production',
        PORT: '3001',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/app',
        REDIS_URL: 'redis://localhost:6379',
        JWT_ACCESS_SECRET: 'replace-with-real-secret-value-123456789',
        JWT_REFRESH_SECRET: 'this-is-a-safe-refresh-secret-for-tests-456',
        CORS_ALLOWED_ORIGINS: 'https://app.example.com',
        METRICS_AUTH_TOKEN: 'metrics-token',
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rejects invalid numeric and boolean settings', () => {
    expect(() =>
      loadApiRuntimeConfig({
        NODE_ENV: 'production',
        PORT: '3001',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/app',
        REDIS_URL: 'redis://localhost:6379',
        JWT_ACCESS_SECRET: 'this-is-a-safe-access-secret-for-tests-123',
        JWT_REFRESH_SECRET: 'this-is-a-safe-refresh-secret-for-tests-456',
        CORS_ALLOWED_ORIGINS: 'https://app.example.com',
        METRICS_AUTH_TOKEN: 'metrics-token',
        METRICS_ENABLED: 'sometimes',
        RATE_LIMIT_AUTH_MAX_ATTEMPTS: 'zero',
      }),
    ).toThrow(/METRICS_ENABLED|RATE_LIMIT_AUTH_MAX_ATTEMPTS/);
  });

  it('requires AI keys only when the worker provider needs them', () => {
    expect(() =>
      loadWorkerRuntimeConfig({
        NODE_ENV: 'production',
        PORT: '3002',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/app',
        REDIS_URL: 'redis://localhost:6379',
        AI_PROVIDER: 'openai',
      }),
    ).toThrow(/AI_API_KEY/);

    expect(() =>
      loadWorkerRuntimeConfig({
        NODE_ENV: 'production',
        PORT: '3002',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/app',
        REDIS_URL: 'redis://localhost:6379',
        AI_PROVIDER: 'deterministic',
      }),
    ).not.toThrow();
  });
});
