import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getStagingSmokeConfig,
  parseHostedHttpUrl,
  redactedSmokeConfig,
  validateStagingSeedEnv,
} from './staging-tools.mjs';

test('staging URL validation rejects localhost and production-looking domains', () => {
  assert.throws(
    () => parseHostedHttpUrl({ STAGING_API_URL: 'https://localhost' }, 'STAGING_API_URL'),
    /localhost/,
  );
  assert.throws(
    () => parseHostedHttpUrl({ STAGING_API_URL: 'https://api.production.example.com' }, 'STAGING_API_URL'),
    /production-looking/,
  );
});

test('smoke config parsing supports redacted output without password', () => {
  const config = getStagingSmokeConfig({
    STAGING_WEB_URL: 'https://app-staging.example.net',
    STAGING_API_URL: 'https://api-staging.example.net',
    STAGING_SMOKE_EMAIL: 'owner@staging.autonomous-csa.test',
    STAGING_SMOKE_PASSWORD: 'SuperSecretPassword123!',
    EXPECTED_GIT_SHA: 'abc1234',
  });

  assert.equal(config.webUrl, 'https://app-staging.example.net');
  assert.equal(config.apiUrl, 'https://api-staging.example.net');
  assert.equal(config.password, 'SuperSecretPassword123!');
  assert.deepEqual(redactedSmokeConfig(config), {
    webUrl: 'https://app-staging.example.net',
    apiUrl: 'https://api-staging.example.net',
    email: 'owner@staging.autonomous-csa.test',
    metricsToken: '[not set]',
    expectedGitSha: 'abc1234',
  });
});

test('staging seed guard refuses non-staging environments', () => {
  assert.throws(
    () => validateStagingSeedEnv({
      APP_ENV: 'production',
      DATABASE_URL: 'postgresql://postgres:postgres@db-staging.example.net:5432/autonomous_csa_staging',
    }),
    /APP_ENV=staging/,
  );
});

test('staging seed guard accepts isolated staging configuration', () => {
  assert.doesNotThrow(() =>
    validateStagingSeedEnv({
      APP_ENV: 'staging',
      DATABASE_URL: 'postgresql://postgres:postgres@db-staging.example.net:5432/autonomous_csa_staging',
      STAGING_OWNER_EMAIL: 'owner@staging.autonomous-csa.test',
      STAGING_ADMIN_EMAIL: 'admin@staging.autonomous-csa.test',
      STAGING_AGENT_EMAIL: 'agent@staging.autonomous-csa.test',
      STAGING_VIEWER_EMAIL: 'viewer@staging.autonomous-csa.test',
      STAGING_USER_PASSWORD_HASH: '$argon2id$v=19$m=1,t=1,p=1$dGVzdA$dGVzdA',
    }),
  );
});
