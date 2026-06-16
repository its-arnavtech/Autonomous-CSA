type NodeEnv = 'development' | 'test' | 'production';
type AppEnv = 'development' | 'test' | 'staging' | 'production';

type RuntimeEnv = Record<string, string | undefined>;

type RedisConnectionConfig = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: Record<string, never>;
};

type RedisRuntimeConfig = {
  url?: string;
  connection: string | RedisConnectionConfig;
  summary: {
    host: string;
    port: number;
    db: number;
  };
};

export type ApiRuntimeConfig = {
  nodeEnv: NodeEnv;
  appEnv: AppEnv;
  isProduction: boolean;
  port: number;
  trustProxy: boolean | number | string;
  databaseUrl: string;
  redis: RedisRuntimeConfig;
  corsAllowedOrigins: string[];
  swaggerEnabled: boolean;
  shutdownGraceMs: number;
  healthTimeoutMs: number;
  metricsEnabled: boolean;
  metricsAuthToken?: string;
  queue: {
    attempts: number;
    backoffBaseMs: number;
    removeOnCompleteCount: number;
    removeOnFailCount: number;
    stalledIntervalMs: number;
    maxStalledCount: number;
  };
  auth: {
    accessSecret: string;
    refreshSecret: string;
    accessTtlSeconds: number;
    refreshTtlSeconds: number;
  };
  rateLimit: {
    auth: {
      windowMs: number;
      maxAttempts: number;
      failMode: 'open' | 'closed';
    };
    api: {
      windowMs: number;
      maxRequests: number;
      failMode: 'open' | 'closed';
    };
  };
};

export type WorkerRuntimeConfig = {
  nodeEnv: NodeEnv;
  appEnv: AppEnv;
  isProduction: boolean;
  port: number;
  databaseUrl: string;
  redis: RedisRuntimeConfig;
  shutdownGraceMs: number;
  healthTimeoutMs: number;
  metricsEnabled: boolean;
  metricsAuthToken?: string;
  queue: ApiRuntimeConfig['queue'];
  llm: {
    provider: 'deterministic' | 'openai' | 'anthropic';
    apiKey?: string;
    enableFallback: boolean;
  };
};

export type WebRuntimeConfig = {
  nodeEnv: NodeEnv;
  appEnv: AppEnv;
  isProduction: boolean;
  apiBaseUrl: string;
  publicWebUrl?: string;
  internalApiUrl?: string;
  cookieSecure: boolean;
  cookieSameSite: 'lax' | 'strict' | 'none';
  cookieNamePrefix: string;
  cookieDomain?: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
};

const PLACEHOLDER_SECRET_PATTERNS = [
  /replace-with/i,
  /change-me/i,
  /placeholder/i,
  /dev-only/i,
  /example/i,
];

function fail(errors: string[]): never {
  throw new Error(
    `Invalid runtime configuration:\n${errors.map((error) => `- ${error}`).join('\n')}`,
  );
}

function parseNodeEnv(value: string | undefined, errors: string[]): NodeEnv {
  const normalized = value?.trim() || 'development';
  if (
    normalized === 'development' ||
    normalized === 'test' ||
    normalized === 'production'
  ) {
    return normalized;
  }

  errors.push('NODE_ENV must be one of development, test, or production');
  return 'development';
}

function parseAppEnv(value: string | undefined, nodeEnv: NodeEnv, errors: string[]): AppEnv {
  const normalized = value?.trim() || nodeEnv;
  if (
    normalized === 'development' ||
    normalized === 'test' ||
    normalized === 'staging' ||
    normalized === 'production'
  ) {
    return normalized;
  }

  errors.push('APP_ENV must be one of development, test, staging, or production');
  return nodeEnv === 'production' ? 'production' : nodeEnv;
}

function parseInteger(input: {
  env: RuntimeEnv;
  name: string;
  defaultValue: number;
  minimum?: number;
  maximum?: number;
  errors: string[];
}): number {
  const raw = input.env[input.name]?.trim();
  const value =
    raw == null || raw === ''
      ? input.defaultValue
      : Number.parseInt(raw, 10);

  if (!Number.isFinite(value)) {
    input.errors.push(`${input.name} must be an integer`);
    return input.defaultValue;
  }

  if (input.minimum != null && value < input.minimum) {
    input.errors.push(`${input.name} must be >= ${input.minimum}`);
  }

  if (input.maximum != null && value > input.maximum) {
    input.errors.push(`${input.name} must be <= ${input.maximum}`);
  }

  return value;
}

function parseBoolean(input: {
  env: RuntimeEnv;
  name: string;
  defaultValue: boolean;
  errors: string[];
}) {
  const raw = input.env[input.name]?.trim()?.toLowerCase();
  if (!raw) {
    return input.defaultValue;
  }

  if (raw === 'true') {
    return true;
  }

  if (raw === 'false') {
    return false;
  }

  input.errors.push(`${input.name} must be true or false`);
  return input.defaultValue;
}

function parseDurationToSeconds(
  rawValue: string | undefined,
  variableName: string,
  fallbackValue: string,
  errors: string[],
) {
  const fallbackMatch = /^(\d+)([smhd])$/i.exec(fallbackValue);
  if (!fallbackMatch) {
    throw new Error(`Invalid fallback duration for ${variableName}`);
  }

  const fallbackAmount = Number.parseInt(fallbackMatch[1], 10);
  const fallbackUnit = fallbackMatch[2].toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 60 * 60 * 24,
  };
  const value = rawValue?.trim() || fallbackValue;
  const match = /^(\d+)([smhd])$/i.exec(value);

  if (!match) {
    errors.push(
      `${variableName} must be a positive duration ending in s, m, h, or d`,
    );
    return fallbackAmount * multipliers[fallbackUnit];
  }

  const amount = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  return amount * multipliers[unit];
}

function parseDurationToMilliseconds(
  rawValue: string | undefined,
  variableName: string,
  fallbackValueMs: number,
  errors: string[],
) {
  if (!rawValue?.trim()) {
    return fallbackValueMs;
  }

  const trimmed = rawValue.trim();
  const numberMatch = /^\d+$/.exec(trimmed);
  if (numberMatch) {
    return Number.parseInt(trimmed, 10);
  }

  const durationSeconds = parseDurationToSeconds(
    trimmed,
    variableName,
    `${Math.max(Math.floor(fallbackValueMs / 1000), 1)}s`,
    errors,
  );

  return durationSeconds * 1000;
}

function parseUrl(
  rawValue: string | undefined,
  variableName: string,
  errors: string[],
  allowedProtocols?: string[],
) {
  const value = rawValue?.trim();
  if (!value) {
    errors.push(`${variableName} is required`);
    return null;
  }

  try {
    const url = new URL(value);
    if (allowedProtocols && !allowedProtocols.includes(url.protocol)) {
      errors.push(
        `${variableName} must use one of: ${allowedProtocols.join(', ')}`,
      );
    }
    return url;
  } catch {
    errors.push(`${variableName} must be a valid URL`);
    return null;
  }
}

function validateSecret(
  name: string,
  value: string | undefined,
  isProduction: boolean,
  errors: string[],
) {
  if (!value?.trim()) {
    errors.push(`${name} is required`);
    return '';
  }

  const trimmed = value.trim();
  if (isProduction && trimmed.length < 32) {
    errors.push(`${name} must be at least 32 characters in production`);
  }

  if (isProduction && PLACEHOLDER_SECRET_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    errors.push(`${name} must not use a placeholder value in production`);
  }

  return trimmed;
}

function parseCorsAllowedOrigins(
  env: RuntimeEnv,
  isProductionLike: boolean,
  errors: string[],
) {
  const raw = env.CORS_ALLOWED_ORIGINS?.trim();

  if (!raw) {
    if (isProductionLike) {
      errors.push('CORS_ALLOWED_ORIGINS is required in production-like environments');
      return [];
    }

    return ['http://localhost:3000'];
  }

  const origins = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    errors.push('CORS_ALLOWED_ORIGINS must contain at least one origin');
  }

  if (isProductionLike && origins.some((origin) => origin === '*' || origin.includes('*'))) {
    errors.push('CORS_ALLOWED_ORIGINS must not contain wildcards in production-like environments');
  }

  for (const origin of origins) {
    parseUrl(origin, `CORS_ALLOWED_ORIGINS entry "${origin}"`, errors, [
      'http:',
      'https:',
    ]);
  }

  return origins;
}

function isLocalHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized.endsWith('.localhost');
}

function allowsLocalStaging(env: RuntimeEnv) {
  return env.ALLOW_LOCAL_STAGING?.trim().toLowerCase() === 'true';
}

function validateHostedUrl(
  url: URL | null,
  variableName: string,
  appEnv: AppEnv,
  env: RuntimeEnv,
  errors: string[],
) {
  if (!url || appEnv !== 'staging') {
    return;
  }

  if (url.protocol === 'http:' && !allowsLocalStaging(env)) {
    errors.push(`${variableName} must use https in staging`);
  }

  if (isLocalHostname(url.hostname) && !allowsLocalStaging(env)) {
    errors.push(`${variableName} must not use localhost in staging`);
  }

  if (/\bprod(uction)?\b/i.test(url.hostname)) {
    errors.push(`${variableName} must not use a production-looking hostname in staging`);
  }
}

function parseSameSite(
  rawValue: string | undefined,
  variableName: string,
  errors: string[],
): 'lax' | 'strict' | 'none' {
  const normalized = rawValue?.trim().toLowerCase();
  if (!normalized || normalized === 'lax') {
    return 'lax';
  }

  if (normalized === 'strict' || normalized === 'none') {
    return normalized;
  }

  errors.push(`${variableName} must be one of lax, strict, or none`);
  return 'lax';
}

function parseTrustProxy(
  rawValue: string | undefined,
  errors: string[],
): boolean | number | string {
  const trimmed = rawValue?.trim();
  if (!trimmed) {
    return false;
  }

  if (trimmed === 'true') {
    return true;
  }

  if (trimmed === 'false') {
    return false;
  }

  const parsedNumber = Number.parseInt(trimmed, 10);
  if (Number.isFinite(parsedNumber) && String(parsedNumber) === trimmed) {
    return parsedNumber;
  }

  if (
    ['loopback', 'linklocal', 'uniquelocal'].includes(trimmed) ||
    trimmed.includes(',')
  ) {
    return trimmed;
  }

  errors.push(
    'TRUST_PROXY must be true, false, an integer hop count, or a supported proxy list',
  );
  return false;
}

function parseRedisRuntimeConfig(env: RuntimeEnv, errors: string[]): RedisRuntimeConfig {
  const redisUrl = env.REDIS_URL?.trim();
  if (redisUrl) {
    const parsedUrl = parseUrl(redisUrl, 'REDIS_URL', errors, [
      'redis:',
      'rediss:',
    ]);

    return {
      url: redisUrl,
      connection: redisUrl,
      summary: {
        host: parsedUrl?.hostname ?? 'localhost',
        port: parsedUrl?.port ? Number.parseInt(parsedUrl.port, 10) : 6379,
        db:
          parsedUrl?.pathname && parsedUrl.pathname !== '/'
            ? Number.parseInt(parsedUrl.pathname.slice(1), 10)
            : 0,
      },
    };
  }

  const host = env.REDIS_HOST?.trim() || 'localhost';
  const port = parseInteger({
    env,
    name: 'REDIS_PORT',
    defaultValue: 6379,
    minimum: 1,
    maximum: 65535,
    errors,
  });

  return {
    connection: {
      host,
      port,
    },
    summary: {
      host,
      port,
      db: 0,
    },
  };
}

function parseSwaggerEnabled(
  env: RuntimeEnv,
  isProductionLike: boolean,
  errors: string[],
) {
  if (env.SWAGGER_ENABLED == null) {
    return !isProductionLike;
  }

  return parseBoolean({
    env,
    name: 'SWAGGER_ENABLED',
    defaultValue: !isProductionLike,
    errors,
  });
}

function parseFailMode(
  rawValue: string | undefined,
  variableName: string,
  defaultValue: 'open' | 'closed',
  errors: string[],
) {
  const normalized = rawValue?.trim().toLowerCase();
  if (!normalized) {
    return defaultValue;
  }

  if (normalized === 'open' || normalized === 'closed') {
    return normalized;
  }

  errors.push(`${variableName} must be "open" or "closed"`);
  return defaultValue;
}

export function loadApiRuntimeConfig(env: RuntimeEnv = process.env): ApiRuntimeConfig {
  const errors: string[] = [];
  const nodeEnv = parseNodeEnv(env.NODE_ENV, errors);
  const appEnv = parseAppEnv(env.APP_ENV, nodeEnv, errors);
  const isProduction = nodeEnv === 'production';
  const isProductionLike = isProduction || appEnv === 'staging' || appEnv === 'production';
  const parsedDatabaseUrl = parseUrl(env.DATABASE_URL, 'DATABASE_URL', errors, [
    'postgres:',
    'postgresql:',
  ]);
  validateHostedUrl(parsedDatabaseUrl, 'DATABASE_URL', appEnv, env, errors);
  const databaseUrl = parsedDatabaseUrl?.toString() ?? '';
  const redis = parseRedisRuntimeConfig(env, errors);
  if (appEnv === 'staging' && isLocalHostname(redis.summary.host) && !allowsLocalStaging(env)) {
    errors.push('REDIS_URL must not use localhost in staging');
  }
  const accessSecret = validateSecret(
    'JWT_ACCESS_SECRET',
    env.JWT_ACCESS_SECRET,
    isProduction,
    errors,
  );
  const refreshSecret = validateSecret(
    'JWT_REFRESH_SECRET',
    env.JWT_REFRESH_SECRET,
    isProduction,
    errors,
  );
  const accessTtlSeconds = parseDurationToSeconds(
    env.JWT_ACCESS_TTL,
    'JWT_ACCESS_TTL',
    '15m',
    errors,
  );
  const refreshTtlSeconds = parseDurationToSeconds(
    env.JWT_REFRESH_TTL,
    'JWT_REFRESH_TTL',
    '7d',
    errors,
  );

  if (refreshTtlSeconds <= accessTtlSeconds) {
    errors.push('JWT_REFRESH_TTL must be greater than JWT_ACCESS_TTL');
  }

  const config: ApiRuntimeConfig = {
    nodeEnv,
    appEnv,
    isProduction,
    port: parseInteger({
      env,
      name: 'PORT',
      defaultValue: 3001,
      minimum: 1,
      maximum: 65535,
      errors,
    }),
    trustProxy: parseTrustProxy(env.TRUST_PROXY, errors),
    databaseUrl,
    redis,
    corsAllowedOrigins: parseCorsAllowedOrigins(env, isProductionLike, errors),
    swaggerEnabled: parseSwaggerEnabled(env, isProductionLike, errors),
    shutdownGraceMs: parseDurationToMilliseconds(
      env.SHUTDOWN_GRACE_MS,
      'SHUTDOWN_GRACE_MS',
      15_000,
      errors,
    ),
    healthTimeoutMs: parseDurationToMilliseconds(
      env.HEALTH_CHECK_TIMEOUT_MS,
      'HEALTH_CHECK_TIMEOUT_MS',
      2_000,
      errors,
    ),
    metricsEnabled: parseBoolean({
      env,
      name: 'METRICS_ENABLED',
      defaultValue: true,
      errors,
    }),
    metricsAuthToken: env.METRICS_AUTH_TOKEN?.trim() || undefined,
    queue: {
      attempts: parseInteger({
        env,
        name: 'QUEUE_JOB_ATTEMPTS',
        defaultValue: 3,
        minimum: 1,
        errors,
      }),
      backoffBaseMs: parseInteger({
        env,
        name: 'QUEUE_BACKOFF_BASE_MS',
        defaultValue: 1000,
        minimum: 100,
        errors,
      }),
      removeOnCompleteCount: parseInteger({
        env,
        name: 'QUEUE_REMOVE_ON_COMPLETE_COUNT',
        defaultValue: 100,
        minimum: 1,
        errors,
      }),
      removeOnFailCount: parseInteger({
        env,
        name: 'QUEUE_REMOVE_ON_FAIL_COUNT',
        defaultValue: 200,
        minimum: 1,
        errors,
      }),
      stalledIntervalMs: parseInteger({
        env,
        name: 'QUEUE_STALLED_INTERVAL_MS',
        defaultValue: 30_000,
        minimum: 5000,
        errors,
      }),
      maxStalledCount: parseInteger({
        env,
        name: 'QUEUE_MAX_STALLED_COUNT',
        defaultValue: 1,
        minimum: 0,
        errors,
      }),
    },
    auth: {
      accessSecret,
      refreshSecret,
      accessTtlSeconds,
      refreshTtlSeconds,
    },
    rateLimit: {
      auth: {
        windowMs: parseDurationToMilliseconds(
          env.RATE_LIMIT_AUTH_WINDOW_MS,
          'RATE_LIMIT_AUTH_WINDOW_MS',
          15 * 60_000,
          errors,
        ),
        maxAttempts: parseInteger({
          env,
          name: 'RATE_LIMIT_AUTH_MAX_ATTEMPTS',
          defaultValue: 5,
          minimum: 1,
          errors,
        }),
        failMode: parseFailMode(
          env.RATE_LIMIT_AUTH_FAIL_MODE,
          'RATE_LIMIT_AUTH_FAIL_MODE',
          'closed',
          errors,
        ),
      },
      api: {
        windowMs: parseDurationToMilliseconds(
          env.RATE_LIMIT_API_WINDOW_MS,
          'RATE_LIMIT_API_WINDOW_MS',
          60_000,
          errors,
        ),
        maxRequests: parseInteger({
          env,
          name: 'RATE_LIMIT_API_MAX_REQUESTS',
          defaultValue: 120,
          minimum: 1,
          errors,
        }),
        failMode: parseFailMode(
          env.RATE_LIMIT_API_FAIL_MODE,
          'RATE_LIMIT_API_FAIL_MODE',
          'open',
          errors,
        ),
      },
    },
  };

  if (isProductionLike && !config.metricsAuthToken && config.metricsEnabled) {
    errors.push('METRICS_AUTH_TOKEN is required when METRICS_ENABLED=true in production-like environments');
  }

  if (config.shutdownGraceMs < config.healthTimeoutMs) {
    errors.push('SHUTDOWN_GRACE_MS must be greater than or equal to HEALTH_CHECK_TIMEOUT_MS');
  }

  if (errors.length > 0) {
    fail(errors);
  }

  return config;
}

export function loadWorkerRuntimeConfig(
  env: RuntimeEnv = process.env,
): WorkerRuntimeConfig {
  const errors: string[] = [];
  const nodeEnv = parseNodeEnv(env.NODE_ENV, errors);
  const appEnv = parseAppEnv(env.APP_ENV, nodeEnv, errors);
  const isProduction = nodeEnv === 'production';
  const parsedDatabaseUrl = parseUrl(env.DATABASE_URL, 'DATABASE_URL', errors, [
    'postgres:',
    'postgresql:',
  ]);
  validateHostedUrl(parsedDatabaseUrl, 'DATABASE_URL', appEnv, env, errors);
  const databaseUrl = parsedDatabaseUrl?.toString() ?? '';
  const provider =
    (env.AI_PROVIDER?.trim().toLowerCase() as
      | 'deterministic'
      | 'openai'
      | 'anthropic'
      | undefined) ?? 'deterministic';

  if (!['deterministic', 'openai', 'anthropic'].includes(provider)) {
    errors.push('AI_PROVIDER must be deterministic, openai, or anthropic');
  }

  const apiKey = env.AI_API_KEY?.trim();
  if (provider !== 'deterministic' && !apiKey) {
    errors.push('AI_API_KEY is required when AI_PROVIDER is openai or anthropic');
  }

  const config: WorkerRuntimeConfig = {
    nodeEnv,
    appEnv,
    isProduction,
    port: parseInteger({
      env,
      name: 'PORT',
      defaultValue: 3002,
      minimum: 1,
      maximum: 65535,
      errors,
    }),
    databaseUrl,
    redis: parseRedisRuntimeConfig(env, errors),
    shutdownGraceMs: parseDurationToMilliseconds(
      env.WORKER_SHUTDOWN_GRACE_MS,
      'WORKER_SHUTDOWN_GRACE_MS',
      30_000,
      errors,
    ),
    healthTimeoutMs: parseDurationToMilliseconds(
      env.HEALTH_CHECK_TIMEOUT_MS,
      'HEALTH_CHECK_TIMEOUT_MS',
      2_000,
      errors,
    ),
    metricsEnabled: parseBoolean({
      env,
      name: 'METRICS_ENABLED',
      defaultValue: true,
      errors,
    }),
    metricsAuthToken: env.METRICS_AUTH_TOKEN?.trim() || undefined,
    queue: {
      attempts: parseInteger({
        env,
        name: 'QUEUE_JOB_ATTEMPTS',
        defaultValue: 3,
        minimum: 1,
        errors,
      }),
      backoffBaseMs: parseInteger({
        env,
        name: 'QUEUE_BACKOFF_BASE_MS',
        defaultValue: 1000,
        minimum: 100,
        errors,
      }),
      removeOnCompleteCount: parseInteger({
        env,
        name: 'QUEUE_REMOVE_ON_COMPLETE_COUNT',
        defaultValue: 100,
        minimum: 1,
        errors,
      }),
      removeOnFailCount: parseInteger({
        env,
        name: 'QUEUE_REMOVE_ON_FAIL_COUNT',
        defaultValue: 200,
        minimum: 1,
        errors,
      }),
      stalledIntervalMs: parseInteger({
        env,
        name: 'QUEUE_STALLED_INTERVAL_MS',
        defaultValue: 30_000,
        minimum: 5000,
        errors,
      }),
      maxStalledCount: parseInteger({
        env,
        name: 'QUEUE_MAX_STALLED_COUNT',
        defaultValue: 1,
        minimum: 0,
        errors,
      }),
    },
    llm: {
      provider,
      apiKey,
      enableFallback: parseBoolean({
        env,
        name: 'AI_ENABLE_FALLBACK',
        defaultValue: true,
        errors,
      }),
    },
  };

  if (appEnv === 'staging' && isLocalHostname(config.redis.summary.host) && !allowsLocalStaging(env)) {
    errors.push('REDIS_URL must not use localhost in staging');
  }

  if ((isProduction || appEnv === 'staging') && !config.metricsAuthToken && config.metricsEnabled) {
    errors.push('METRICS_AUTH_TOKEN is required when METRICS_ENABLED=true in production-like environments');
  }

  if (errors.length > 0) {
    fail(errors);
  }

  return config;
}

export function loadWebRuntimeConfig(env: RuntimeEnv = process.env): WebRuntimeConfig {
  const errors: string[] = [];
  const nodeEnv = parseNodeEnv(env.NODE_ENV, errors);
  const appEnv = parseAppEnv(env.APP_ENV, nodeEnv, errors);
  const isProduction = nodeEnv === 'production';
  const isProductionLike = isProduction || appEnv === 'staging' || appEnv === 'production';
  const apiBaseUrl = parseUrl(env.API_BASE_URL, 'API_BASE_URL', errors, [
    'http:',
    'https:',
  ]);
  const publicWebUrl = env.WEB_PUBLIC_URL?.trim()
    ? parseUrl(env.WEB_PUBLIC_URL, 'WEB_PUBLIC_URL', errors, ['http:', 'https:'])
    : null;
  const internalApiUrl = env.INTERNAL_API_URL?.trim()
    ? parseUrl(env.INTERNAL_API_URL, 'INTERNAL_API_URL', errors, ['http:', 'https:'])
    : null;
  const cookieSecure = parseBoolean({
    env,
    name: 'AUTH_COOKIE_SECURE',
    defaultValue: isProductionLike,
    errors,
  });
  const cookieSameSite = parseSameSite(
    env.AUTH_COOKIE_SAME_SITE,
    'AUTH_COOKIE_SAME_SITE',
    errors,
  );
  const accessTtlSeconds = parseDurationToSeconds(
    env.JWT_ACCESS_TTL,
    'JWT_ACCESS_TTL',
    '15m',
    errors,
  );
  const refreshTtlSeconds = parseDurationToSeconds(
    env.JWT_REFRESH_TTL,
    'JWT_REFRESH_TTL',
    '7d',
    errors,
  );

  validateHostedUrl(apiBaseUrl, 'API_BASE_URL', appEnv, env, errors);
  validateHostedUrl(publicWebUrl, 'WEB_PUBLIC_URL', appEnv, env, errors);

  if (isProductionLike && !cookieSecure && !allowsLocalStaging(env)) {
    errors.push('AUTH_COOKIE_SECURE must be true in production-like environments');
  }

  if (cookieSameSite === 'none' && !cookieSecure) {
    errors.push('AUTH_COOKIE_SECURE must be true when AUTH_COOKIE_SAME_SITE=none');
  }

  if (refreshTtlSeconds <= accessTtlSeconds) {
    errors.push('JWT_REFRESH_TTL must be greater than JWT_ACCESS_TTL');
  }

  const cookieNamePrefix = env.AUTH_COOKIE_NAME_PREFIX?.trim() || 'au';
  if (!/^[a-z0-9][a-z0-9_-]{1,30}$/i.test(cookieNamePrefix)) {
    errors.push('AUTH_COOKIE_NAME_PREFIX must be 2-31 URL-safe characters');
  }

  const cookieDomain = env.AUTH_COOKIE_DOMAIN?.trim() || undefined;
  if (appEnv === 'staging' && !cookieDomain && !allowsLocalStaging(env)) {
    errors.push('AUTH_COOKIE_DOMAIN is required in staging');
  }

  if (errors.length > 0) {
    fail(errors);
  }

  return {
    nodeEnv,
    appEnv,
    isProduction,
    apiBaseUrl: apiBaseUrl?.toString() ?? '',
    publicWebUrl: publicWebUrl?.toString(),
    internalApiUrl: internalApiUrl?.toString(),
    cookieSecure,
    cookieSameSite,
    cookieNamePrefix,
    cookieDomain,
    accessTtlSeconds,
    refreshTtlSeconds,
  };
}
