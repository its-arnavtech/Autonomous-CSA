#!/usr/bin/env node
import {
  getStagingSmokeConfig,
  redactedSmokeConfig,
} from './lib/staging-tools.mjs';

const config = getStagingSmokeConfig();
const results = [];

async function step(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, status: 'passed', durationMs: Date.now() - started, detail });
  } catch (error) {
    results.push({
      name,
      status: 'failed',
      durationMs: Date.now() - started,
      detail: error instanceof Error ? error.message : 'unknown error',
    });
    throw error;
  }
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body };
}

function requireOk(result, context) {
  if (!result.response.ok) {
    throw new Error(`${context} failed with HTTP ${result.response.status}`);
  }
  return result.body;
}

function authHeaders(accessToken, organizationId) {
  return {
    authorization: `Bearer ${accessToken}`,
    'x-organization-id': organizationId,
  };
}

let auth;
let organizationId;
let ticketId;

try {
  console.log(JSON.stringify({
    event: 'staging.smoke.started',
    config: redactedSmokeConfig(config),
  }));

  await step('web loads', async () => {
    const result = await request(config.webUrl);
    if (!result.response.ok) {
      throw new Error(`web returned HTTP ${result.response.status}`);
    }
    return { statusCode: result.response.status };
  });

  await step('api liveness', async () =>
    requireOk(await request(`${config.apiUrl}/health/live`), 'api liveness'));

  await step('api readiness', async () =>
    requireOk(await request(`${config.apiUrl}/health/ready`), 'api readiness'));

  await step('version endpoint', async () => {
    const version = requireOk(await request(`${config.apiUrl}/version`), 'version endpoint');
    if (config.expectedGitSha && version.gitSha !== config.expectedGitSha) {
      throw new Error(`expected gitSha ${config.expectedGitSha}, got ${version.gitSha}`);
    }
    return version;
  });

  await step('login', async () => {
    auth = requireOk(
      await request(`${config.apiUrl}/auth/login`, {
        method: 'POST',
        body: JSON.stringify({ email: config.email, password: config.password }),
      }),
      'login',
    );
    organizationId = auth.memberships?.[0]?.organizationId;
    if (!auth.accessToken || !auth.refreshToken || !organizationId) {
      throw new Error('login did not return tokens and an organization');
    }
    return { memberships: auth.memberships.length };
  });

  await step('/auth/me', async () =>
    requireOk(
      await request(`${config.apiUrl}/auth/me`, {
        headers: { authorization: `Bearer ${auth.accessToken}` },
      }),
      '/auth/me',
    ));

  await step('refresh', async () => {
    auth = requireOk(
      await request(`${config.apiUrl}/auth/refresh`, {
        method: 'POST',
        body: JSON.stringify({ refreshToken: auth.refreshToken }),
      }),
      'refresh',
    );
    if (!auth.accessToken || !auth.refreshToken) {
      throw new Error('refresh did not return rotated tokens');
    }
    return { rotated: true };
  });

  await step('ticket list', async () =>
    requireOk(
      await request(`${config.apiUrl}/tickets`, {
        headers: authHeaders(auth.accessToken, organizationId),
      }),
      'ticket list',
    ));

  await step('ticket create', async () => {
    const created = requireOk(
      await request(`${config.apiUrl}/tickets`, {
        method: 'POST',
        headers: authHeaders(auth.accessToken, organizationId),
        body: JSON.stringify({
          subject: `Staging smoke ${new Date().toISOString()}`,
          body: 'Safe smoke-test ticket from the automated staging verifier.',
          customerEmail: 'smoke.customer@example.test',
          customerName: 'Smoke Customer',
          priority: 'NORMAL',
        }),
      }),
      'ticket create',
    );
    ticketId = created.ticketId;
    if (!ticketId) {
      throw new Error('ticket create did not return ticketId');
    }
    return { ticketId, enqueuedJobId: created.enqueuedJobId };
  });

  await step('ticket detail', async () =>
    requireOk(
      await request(`${config.apiUrl}/tickets/${ticketId}`, {
        headers: authHeaders(auth.accessToken, organizationId),
      }),
      'ticket detail',
    ));

  await step('knowledge search', async () =>
    requireOk(
      await request(`${config.apiUrl}/knowledge/search`, {
        method: 'POST',
        headers: authHeaders(auth.accessToken, organizationId),
        body: JSON.stringify({ query: 'login', limit: 5 }),
      }),
      'knowledge search',
    ));

  await step('operations summary', async () =>
    requireOk(
      await request(`${config.apiUrl}/operations/summary`, {
        headers: authHeaders(auth.accessToken, organizationId),
      }),
      'operations summary',
    ));

  await step('metrics auth behavior', async () => {
    const unauthenticated = await request(`${config.apiUrl}/metrics`);
    if (unauthenticated.response.status !== 401) {
      throw new Error(`expected unauthenticated metrics to return 401, got ${unauthenticated.response.status}`);
    }

    if (!config.metricsToken) {
      return { unauthenticatedStatus: 401, authenticatedStatus: 'skipped' };
    }

    const authenticated = await request(`${config.apiUrl}/metrics`, {
      headers: { authorization: `Bearer ${config.metricsToken}` },
    });
    if (!authenticated.response.ok) {
      throw new Error(`authenticated metrics returned HTTP ${authenticated.response.status}`);
    }
    return { unauthenticatedStatus: 401, authenticatedStatus: authenticated.response.status };
  });

  await step('logout', async () =>
    requireOk(
      await request(`${config.apiUrl}/auth/logout`, {
        method: 'POST',
        body: JSON.stringify({ refreshToken: auth.refreshToken }),
      }),
      'logout',
    ));

  console.log(JSON.stringify({ event: 'staging.smoke.passed', results }));
} catch {
  console.error(JSON.stringify({ event: 'staging.smoke.failed', results }));
  process.exit(1);
}
