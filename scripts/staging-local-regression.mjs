#!/usr/bin/env node
const apiUrl = (process.env.STAGING_API_URL ?? '').replace(/\/+$/, '');
const password = process.env.STAGING_SMOKE_PASSWORD;

const users = [
  ['OWNER', process.env.STAGING_OWNER_EMAIL],
  ['ADMIN', process.env.STAGING_ADMIN_EMAIL],
  ['AGENT', process.env.STAGING_AGENT_EMAIL],
  ['VIEWER', process.env.STAGING_VIEWER_EMAIL],
];

if (!apiUrl || !password || users.some(([, email]) => !email)) {
  throw new Error('STAGING_API_URL, STAGING_*_EMAIL, and STAGING_SMOKE_PASSWORD are required');
}

const results = [];

async function request(path, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  const body = text && response.headers.get('content-type')?.includes('json')
    ? JSON.parse(text)
    : text;
  return { response, body };
}

function expectStatus(result, expected, label) {
  const statuses = Array.isArray(expected) ? expected : [expected];
  if (!statuses.includes(result.response.status)) {
    throw new Error(`${label} expected HTTP ${statuses.join('/')}, got ${result.response.status}`);
  }
}

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

async function login(role, email) {
  const result = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  expectStatus(result, [200, 201], `${role} login`);
  const organizationId = result.body?.memberships?.[0]?.organizationId;
  if (!result.body?.accessToken || !result.body?.refreshToken || !organizationId) {
    throw new Error(`${role} login did not return tokens and organization`);
  }
  return {
    role,
    accessToken: result.body.accessToken,
    refreshToken: result.body.refreshToken,
    organizationId,
  };
}

function authHeaders(session, organizationId = session.organizationId) {
  return {
    authorization: `Bearer ${session.accessToken}`,
    'x-organization-id': organizationId,
  };
}

const sessions = new Map();

try {
  await step('role logins', async () => {
    for (const [role, email] of users) {
      sessions.set(role, await login(role, email));
    }
    return { roles: users.map(([role]) => role) };
  });

  await step('auth me', async () => {
    for (const [role, session] of sessions) {
      expectStatus(
        await request('/auth/me', {
          headers: { authorization: `Bearer ${session.accessToken}` },
        }),
        200,
        `${role} /auth/me`,
      );
    }
    return { rolesChecked: sessions.size };
  });

  await step('refresh revocation', async () => {
    const owner = sessions.get('OWNER');
    const refreshed = await request('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: owner.refreshToken }),
    });
    expectStatus(refreshed, [200, 201], 'refresh');
    await request('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: refreshed.body.refreshToken }),
    });
    expectStatus(
      await request('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: refreshed.body.refreshToken }),
      }),
      401,
      'revoked refresh',
    );
    return { revokedRefreshRejected: true };
  });

  await step('tenant isolation', async () => {
    const owner = sessions.get('OWNER');
    const forgedOrganizationId = '00000000-0000-4000-8000-000000000011';
    expectStatus(
      await request('/tickets', { headers: authHeaders(owner) }),
      200,
      'valid organization access',
    );
    expectStatus(
      await request('/tickets', { headers: authHeaders(owner, forgedOrganizationId) }),
      403,
      'forged organization access',
    );
    return { validOrganizationAccess: true, forgedOrganizationRejected: true };
  });

  await step('rbac matrix', async () => {
    for (const role of ['OWNER', 'ADMIN', 'AGENT', 'VIEWER']) {
      const session = sessions.get(role);
      expectStatus(
        await request('/operations/summary', { headers: authHeaders(session) }),
        200,
        `${role} read access`,
      );
    }

    for (const role of ['OWNER', 'ADMIN', 'AGENT']) {
      const session = sessions.get(role);
      expectStatus(
        await request('/tickets', {
          method: 'POST',
          headers: authHeaders(session),
          body: JSON.stringify({
            subject: `RBAC ${role} ${new Date().toISOString()}`,
            body: 'Safe local staging RBAC ticket.',
            customerEmail: `rbac-${role.toLowerCase()}@example.test`,
            customerName: `RBAC ${role}`,
            priority: 'NORMAL',
          }),
        }),
        [200, 201],
        `${role} ticket create`,
      );
    }

    const viewer = sessions.get('VIEWER');
    expectStatus(
      await request('/tickets', {
        method: 'POST',
        headers: authHeaders(viewer),
        body: JSON.stringify({
          subject: 'RBAC viewer denied',
          body: 'Viewer should not create this ticket.',
          customerEmail: 'rbac-viewer@example.test',
          customerName: 'RBAC Viewer',
          priority: 'NORMAL',
        }),
      }),
      403,
      'VIEWER ticket create',
    );

    expectStatus(
      await request('/orgs/settings', {
        method: 'PATCH',
        headers: authHeaders(sessions.get('AGENT')),
        body: JSON.stringify({ autoRespond: false }),
      }),
      403,
      'AGENT manage settings',
    );

    return { owner: 'passed', admin: 'passed', agent: 'passed', viewer: 'passed' };
  });

  await step('operations endpoints', async () => {
    const owner = sessions.get('OWNER');
    const headers = authHeaders(owner);
    expectStatus(await request('/operations/summary', { headers }), 200, 'operations summary');
    expectStatus(await request('/operations/runs?limit=5', { headers }), 200, 'operations runs');
    expectStatus(await request('/operations/failures?limit=5', { headers }), 200, 'operations failures');
    expectStatus(await request('/operations/audit?limit=5', { headers }), 200, 'operations audit');
    const csv = await request('/operations/audit/export?limit=5', { headers });
    expectStatus(csv, 200, 'operations audit export');
    if (!csv.response.headers.get('content-type')?.includes('text/csv')) {
      throw new Error('operations audit export did not return CSV');
    }
    return { summary: true, runs: true, failures: true, audit: true, csvExport: true };
  });

  console.log(JSON.stringify({ event: 'staging.local.regression.passed', results }));
} catch {
  console.error(JSON.stringify({ event: 'staging.local.regression.failed', results }));
  process.exit(1);
}
