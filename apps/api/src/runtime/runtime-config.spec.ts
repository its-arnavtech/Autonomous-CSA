import {
  loadApiRuntimeConfig,
  loadWebRuntimeConfig,
  loadWorkerRuntimeConfig,
} from '@agentic-support/observability';

describe('runtime configuration validation', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

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

  it('accepts secure staging web cookie settings', () => {
    expect(
      loadWebRuntimeConfig({
        NODE_ENV: 'production',
        APP_ENV: 'staging',
        API_BASE_URL: 'https://api-staging.example.net',
        WEB_PUBLIC_URL: 'https://app-staging.example.net',
        AUTH_COOKIE_SECURE: 'true',
        AUTH_COOKIE_SAME_SITE: 'lax',
        AUTH_COOKIE_NAME_PREFIX: 'stg_au',
        AUTH_COOKIE_DOMAIN: '.staging.example.net',
        JWT_ACCESS_TTL: '15m',
        JWT_REFRESH_TTL: '7d',
      }),
    ).toMatchObject({
      appEnv: 'staging',
      apiBaseUrl: 'https://api-staging.example.net/',
      cookieSecure: true,
      cookieNamePrefix: 'stg_au',
      cookieDomain: '.staging.example.net',
    });
  });

  it('rejects localhost staging URLs and Redis state', () => {
    expect(() =>
      loadApiRuntimeConfig({
        NODE_ENV: 'production',
        APP_ENV: 'staging',
        PORT: '3001',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/app',
        REDIS_URL: 'redis://localhost:6379',
        JWT_ACCESS_SECRET: 'this-is-a-safe-access-secret-for-tests-123',
        JWT_REFRESH_SECRET: 'this-is-a-safe-refresh-secret-for-tests-456',
        CORS_ALLOWED_ORIGINS: 'https://app-staging.example.net',
        METRICS_AUTH_TOKEN: 'metrics-token',
      }),
    ).toThrow(/DATABASE_URL|REDIS_URL/);
  });

  it('disables Swagger by default in staging', () => {
    expect(
      loadApiRuntimeConfig({
        NODE_ENV: 'production',
        APP_ENV: 'staging',
        PORT: '3001',
        DATABASE_URL: 'postgresql://postgres:postgres@postgres-staging.internal:5432/app',
        REDIS_URL: 'rediss://redis-staging.internal:6379',
        JWT_ACCESS_SECRET: 'this-is-a-safe-access-secret-for-tests-123',
        JWT_REFRESH_SECRET: 'this-is-a-safe-refresh-secret-for-tests-456',
        CORS_ALLOWED_ORIGINS: 'https://app-staging.example.net',
        METRICS_AUTH_TOKEN: 'metrics-token',
      }).swaggerEnabled,
    ).toBe(false);
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
        METRICS_AUTH_TOKEN: 'metrics-token',
      }),
    ).not.toThrow();
  });
});
