const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function assertNotLocalUrl(url, name) {
  const host = url.hostname.toLowerCase();
  if (LOCAL_HOSTS.has(host) || host.endsWith('.localhost')) {
    throw new Error(`${name} must not use localhost in staging`);
  }
}

function assertNotProductionLooking(url, name) {
  if (/\bprod(uction)?\b/i.test(url.hostname) || /\bprod(uction)?\b/i.test(url.pathname)) {
    throw new Error(`${name} must not point at a production-looking target`);
  }
}

export function parseHostedHttpUrl(env, name) {
  const raw = required(env, name);
  const url = new URL(raw);
  if (url.protocol !== 'https:') {
    throw new Error(`${name} must use https in staging`);
  }
  assertNotLocalUrl(url, name);
  assertNotProductionLooking(url, name);
  return url;
}

export function parseHostedPostgresUrl(env, name = 'DATABASE_URL') {
  const raw = required(env, name);
  const url = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error(`${name} must use postgres:// or postgresql://`);
  }
  assertNotLocalUrl(url, name);
  assertNotProductionLooking(url, name);
  return url;
}

export function getStagingSmokeConfig(env = process.env) {
  return {
    webUrl: parseHostedHttpUrl(env, 'STAGING_WEB_URL').toString().replace(/\/$/, ''),
    apiUrl: parseHostedHttpUrl(env, 'STAGING_API_URL').toString().replace(/\/$/, ''),
    email: required(env, 'STAGING_SMOKE_EMAIL'),
    password: required(env, 'STAGING_SMOKE_PASSWORD'),
    metricsToken: env.METRICS_AUTH_TOKEN?.trim() || undefined,
    expectedGitSha: env.EXPECTED_GIT_SHA?.trim() || undefined,
  };
}

export function validateStagingSeedEnv(env = process.env) {
  if (env.APP_ENV?.trim() !== 'staging') {
    throw new Error('APP_ENV=staging is required for staging seed');
  }

  parseHostedPostgresUrl(env, 'DATABASE_URL');

  for (const name of [
    'STAGING_OWNER_EMAIL',
    'STAGING_ADMIN_EMAIL',
    'STAGING_AGENT_EMAIL',
    'STAGING_VIEWER_EMAIL',
    'STAGING_USER_PASSWORD_HASH',
  ]) {
    required(env, name);
  }
}

export function redactedSmokeConfig(config) {
  return {
    webUrl: config.webUrl,
    apiUrl: config.apiUrl,
    email: config.email,
    metricsToken: config.metricsToken ? '[set]' : '[not set]',
    expectedGitSha: config.expectedGitSha ?? '[not set]',
  };
}
