#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const runOutput = join(root, 'run-output');
const envPath = join(runOutput, 'staging-local.env');
const resultPath = join(runOutput, 'staging-local-results.json');
const composeFile = join(root, 'docker-compose.staging.yml');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const docker = 'docker';
const composeBase = ['compose', '--env-file', envPath, '-f', composeFile];

function run(command, args, options = {}) {
  const useShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    env: { ...process.env, ...(options.env ?? {}) },
    shell: useShell,
  });

  if (result.error || result.status !== 0) {
    const detail = options.capture
      ? `\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
      : '';
    const errorDetail = result.error ? ` (${result.error.message})` : '';
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}${errorDetail}${detail}`);
  }

  return options.capture ? result.stdout.trim() : '';
}

function secret(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

function gitSha() {
  return run('git', ['rev-parse', '--short=12', 'HEAD'], { capture: true });
}

function quoteEnv(value) {
  return String(value).replace(/\r?\n/g, '').replace(/\$/g, '$$$$');
}

function loadEnvFile() {
  const env = {};
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index === -1) continue;
    env[line.slice(0, index)] = line.slice(index + 1);
  }
  return env;
}

function generatePasswordHash(password) {
  const hashScript = join(runOutput, 'hash-staging-password.cjs');
  writeFileSync(
    hashScript,
    "const argon2 = require(require.resolve('argon2', { paths: [process.env.ARGON2_REQUIRE_PATH] }));\nargon2.hash(process.env.STAGING_PASSWORD_FOR_HASH, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }).then((hash) => process.stdout.write(hash));\n",
  );
  try {
    return run(
      pnpm,
      ['--filter', '@apps/api', 'exec', 'node', hashScript],
      {
        capture: true,
        env: {
          STAGING_PASSWORD_FOR_HASH: password,
          ARGON2_REQUIRE_PATH: join(root, 'apps', 'api'),
        },
      },
    );
  } finally {
    unlinkSync(hashScript);
  }
}

function ensureEnv({ force = false } = {}) {
  mkdirSync(runOutput, { recursive: true });
  if (existsSync(envPath) && !force) {
    return loadEnvFile();
  }

  const sha = gitSha();
  const postgresPassword = secret(24);
  const redisPassword = secret(24);
  const smokePassword = `Stg!${secret(24)}`;
  const passwordHash = generatePasswordHash(smokePassword);
  const databaseUrl =
    `postgresql://postgres:${postgresPassword}@postgres:5432/agentic_support`;
  const redisUrl = `redis://:${redisPassword}@redis:6379/0`;

  const env = {
    COMPOSE_PROJECT_NAME: 'autonomous-csa-staging',
    STAGING_LOCAL_ENV_FILE: './run-output/staging-local.env',
    APP_ENV: 'staging',
    NODE_ENV: 'production',
    ALLOW_LOCAL_STAGING: 'true',
    APP_VERSION: '1.0.0-local',
    GIT_SHA: sha,
    BUILD_TIMESTAMP: new Date().toISOString(),
    POSTGRES_USER: 'postgres',
    POSTGRES_PASSWORD: postgresPassword,
    POSTGRES_DB: 'agentic_support',
    DATABASE_URL: databaseUrl,
    REDIS_PASSWORD: redisPassword,
    REDIS_URL: redisUrl,
    JWT_ACCESS_SECRET: secret(48),
    JWT_REFRESH_SECRET: secret(48),
    METRICS_AUTH_TOKEN: secret(32),
    API_BASE_URL: 'http://api:3001',
    WEB_PUBLIC_URL: 'http://web:3000',
    INTERNAL_WEB_URL: 'http://web:3000',
    INTERNAL_API_URL: 'http://api:3001',
    CORS_ALLOWED_ORIGINS: 'http://web:3000,http://localhost:3100',
    AUTH_COOKIE_SECURE: 'false',
    AUTH_COOKIE_SAME_SITE: 'lax',
    AUTH_COOKIE_NAME_PREFIX: 'stg_local',
    AI_PROVIDER: 'deterministic',
    AI_ENABLE_FALLBACK: 'true',
    METRICS_ENABLED: 'true',
    SWAGGER_ENABLED: 'false',
    TRUST_PROXY: 'true',
    LOG_LEVEL: 'info',
    LOG_FORMAT: 'json',
    LOG_PRETTY: 'false',
    HEALTH_CHECK_TIMEOUT_MS: '2000',
    SHUTDOWN_GRACE_MS: '15000',
    WORKER_SHUTDOWN_GRACE_MS: '30000',
    QUEUE_JOB_ATTEMPTS: '3',
    QUEUE_BACKOFF_BASE_MS: '1000',
    QUEUE_REMOVE_ON_COMPLETE_COUNT: '100',
    QUEUE_REMOVE_ON_FAIL_COUNT: '200',
    QUEUE_STALLED_INTERVAL_MS: '30000',
    QUEUE_MAX_STALLED_COUNT: '1',
    RATE_LIMIT_AUTH_WINDOW_MS: '15m',
    RATE_LIMIT_AUTH_MAX_ATTEMPTS: '5',
    RATE_LIMIT_AUTH_FAIL_MODE: 'closed',
    RATE_LIMIT_API_WINDOW_MS: '60s',
    RATE_LIMIT_API_MAX_REQUESTS: '120',
    RATE_LIMIT_API_FAIL_MODE: 'open',
    STAGING_OWNER_EMAIL: 'owner@staging.local',
    STAGING_ADMIN_EMAIL: 'admin@staging.local',
    STAGING_AGENT_EMAIL: 'agent@staging.local',
    STAGING_VIEWER_EMAIL: 'viewer@staging.local',
    STAGING_USER_PASSWORD_HASH: passwordHash,
    STAGING_SMOKE_EMAIL: 'owner@staging.local',
    STAGING_SMOKE_PASSWORD: smokePassword,
  };

  writeFileSync(
    envPath,
    `${Object.entries(env)
      .map(([key, value]) => `${key}=${quoteEnv(value)}`)
      .join('\n')}\n`,
  );
  return env;
}

function compose(args, options) {
  return run(docker, [...composeBase, ...args], options);
}

function clearSyntheticAuthRateLimits(env) {
  if (env.ALLOW_LOCAL_STAGING !== 'true') {
    throw new Error('Refusing to clear auth rate limits outside the local staging profile');
  }
  compose([
    'exec',
    '-T',
    'redis',
    'sh',
    '-lc',
    `redis-cli -a "$REDIS_PASSWORD" --no-auth-warning EVAL "local keys=redis.call('KEYS', ARGV[1]); if #keys == 0 then return 0 end; return redis.call('DEL', unpack(keys))" 0 'rate-limit:auth:*'`,
  ], { capture: true });
}

function hostEnv(env) {
  return {
    ...env,
    DATABASE_URL: `postgresql://postgres:${env.POSTGRES_PASSWORD}@localhost:55432/${env.POSTGRES_DB}`,
    REDIS_URL: `redis://:${env.REDIS_PASSWORD}@127.0.0.1:6380/0`,
    STAGING_WEB_URL: 'http://localhost:3100/login',
    STAGING_API_URL: 'http://localhost:3101',
    EXPECTED_GIT_SHA: env.GIT_SHA,
  };
}

async function waitForHttp(url, label, timeoutMs = 120_000) {
  const started = Date.now();
  let lastError = '';
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'unknown error';
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`${label} did not become ready: ${lastError}`);
}

function psql(env, sql, database = env.POSTGRES_DB) {
  return compose(
    [
      'exec',
      '-T',
      'postgres',
      'sh',
      '-lc',
      `PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "${database}" -Atc '${sql.replace(/'/g, "'\\''")}'`,
    ],
    { capture: true },
  );
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function parseLastJsonObject(output) {
  const text = String(output ?? '');
  const start = text.lastIndexOf('\n{');
  const jsonText = (start >= 0 ? text.slice(start + 1) : text.slice(text.indexOf('{'))).trim();
  return JSON.parse(jsonText);
}

async function verify() {
  const env = ensureEnv();
  const henv = hostEnv(env);
  const results = {
    startedAt: new Date().toISOString(),
    gitSha: env.GIT_SHA,
    checks: {},
  };

  compose(['up', '-d', '--build', 'postgres', 'redis', 'migration', 'api', 'worker', 'web']);
  await waitForHttp('http://localhost:3101/health/ready', 'api readiness');
  await waitForHttp('http://localhost:3102/health/ready', 'worker readiness');
  await waitForHttp('http://localhost:3100/api/version', 'web readiness');
  results.checks.readiness = 'passed';
  clearSyntheticAuthRateLimits(env);

  compose(['run', '--rm', 'migration']);
  results.checks.migrationIdempotency = 'passed';
  results.postgresVersion = psql(env, 'SHOW server_version;');
  results.migrationCount = Number(psql(env, 'SELECT count(*) FROM _prisma_migrations;'));
  run(pnpm, ['db:validate'], { env: henv });
  results.checks.prismaValidate = 'passed';

  run(pnpm, ['staging:redis:check'], { env: henv });
  results.checks.redisBullmq = 'passed';

  compose(['run', '--rm', '--no-deps', 'api', 'pnpm', '--dir', '/app/packages/db', 'db:seed:staging']);
  compose(['run', '--rm', '--no-deps', 'api', 'pnpm', '--dir', '/app/packages/db', 'db:seed:staging']);
  results.checks.seedIdempotency = 'passed';

  run(pnpm, ['staging:smoke'], { env: henv });
  results.checks.smoke = 'passed';
  run(pnpm, ['staging:local:regression'], { env: henv });
  results.checks.regression = 'passed';

  const backupDir = join(runOutput, 'staging-backups');
  mkdirSync(backupDir, { recursive: true });
  const backupOutput = run(pnpm, ['db:backup'], {
    capture: true,
    env: { ...henv, BACKUP_DIR: backupDir, APP_VERSION: env.APP_VERSION },
  });
  const backupEvent = parseLastJsonObject(backupOutput);
  results.backup = {
    path: backupEvent.backupPath,
    checksum: backupEvent.checksum,
    sizeBytes: readFileSync(backupEvent.backupPath).byteLength,
    metadataChecksum: sha256(`${backupEvent.backupPath}.json`),
  };

  const restoreDb = `agentic_support_restore_${Date.now()}`;
  psql(env, `CREATE DATABASE ${restoreDb};`, 'postgres');
  try {
    run(
      pnpm,
      [
        'db:restore',
        backupEvent.backupPath,
        `--target-database-url=postgresql://postgres:${env.POSTGRES_PASSWORD}@localhost:55432/${restoreDb}`,
        '--yes=true',
      ],
      { env: henv },
    );
    const restoredMigrations = psql(env, 'SELECT count(*) FROM _prisma_migrations;', restoreDb);
    const restoredUsers = psql(env, 'SELECT count(*) FROM "User";', restoreDb);
    results.restore = {
      database: restoreDb,
      migrations: Number(restoredMigrations),
      users: Number(restoredUsers),
    };
  } finally {
    psql(env, `DROP DATABASE IF EXISTS ${restoreDb};`, 'postgres');
  }

  await waitForHttp('http://localhost:3101/health/ready', 'api readiness after restore');
  await waitForHttp('http://localhost:3100/api/version', 'web readiness after restore');
  results.version = {
    api: await (await fetch('http://localhost:3101/version')).json(),
    web: await (await fetch('http://localhost:3100/api/version')).json(),
  };

  writeFileSync(resultPath, `${JSON.stringify(results, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ event: 'staging.local.verify.completed', resultPath }, null, 2)}\n`);
}

function up() {
  ensureEnv();
  compose(['up', '-d', '--build', 'postgres', 'redis', 'migration', 'api', 'worker', 'web']);
}

function down() {
  ensureEnv();
  compose(['down']);
}

function logs() {
  ensureEnv();
  compose(['logs', '--tail', '200']);
}

function reset() {
  ensureEnv({ force: true });
  compose(['down', '-v', '--remove-orphans']);
  rmSync(join(runOutput, 'staging-backups'), { recursive: true, force: true });
}

const command = process.argv[2];
try {
  if (command === 'up') up();
  else if (command === 'down') down();
  else if (command === 'logs') logs();
  else if (command === 'reset') reset();
  else if (command === 'verify') await verify();
  else {
    throw new Error('Usage: node scripts/staging-local.mjs <up|down|logs|reset|verify>');
  }
} catch (error) {
  process.stderr.write(
    `${JSON.stringify(
      {
        event: 'staging.local.failed',
        message: error instanceof Error ? error.message : 'unknown error',
      },
      null,
      2,
    )}\n`,
  );
  process.exit(1);
}
