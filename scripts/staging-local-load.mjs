#!/usr/bin/env node
const apiUrl = (process.env.STAGING_API_URL ?? '').replace(/\/+$/, '');
const email =
  process.env.STAGING_LOAD_EMAIL ??
  process.env.STAGING_ADMIN_EMAIL ??
  process.env.STAGING_SMOKE_EMAIL;
const password = process.env.STAGING_SMOKE_PASSWORD;
const vus = Number.parseInt(process.env.STAGING_LOAD_VUS ?? '3', 10);
const durationSeconds = Number.parseInt(process.env.STAGING_LOAD_DURATION_SECONDS ?? '30', 10);
const pacingMs = Number.parseInt(process.env.STAGING_LOAD_PACING_MS ?? '1000', 10);
const maxErrorRate = Number.parseFloat(process.env.STAGING_LOAD_MAX_ERROR_RATE ?? '0.01');
const maxP95Ms = Number.parseInt(process.env.STAGING_LOAD_MAX_P95_MS ?? '1000', 10);

if (!apiUrl || !email || !password) {
  throw new Error('STAGING_API_URL, STAGING_SMOKE_EMAIL, and STAGING_SMOKE_PASSWORD are required');
}

const durations = [];
let requests = 0;
let errors = 0;

async function timed(name, fn) {
  const started = performance.now();
  try {
    const response = await fn();
    requests += 1;
    durations.push(performance.now() - started);
    if (!response.ok) {
      errors += 1;
    }
    return response;
  } catch (error) {
    requests += 1;
    errors += 1;
    durations.push(performance.now() - started);
    throw new Error(`${name} failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

async function json(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function login() {
  const login = await timed('login', () =>
    fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }));
  if (!login.ok) {
    throw new Error(`login failed with HTTP ${login.status}`);
  }
  const auth = await json(login);
  const organizationId = auth?.memberships?.[0]?.organizationId;
  if (!auth?.accessToken || !organizationId) {
    throw new Error('login did not return an access token and organization');
  }
  return { auth, organizationId };
}

async function vu(index, stopAt, session) {
  const headers = {
    authorization: `Bearer ${session.auth.accessToken}`,
    'x-organization-id': session.organizationId,
    'content-type': 'application/json',
  };

  while (Date.now() < stopAt) {
    const ticketList = await timed('ticket list', () => fetch(`${apiUrl}/tickets`, { headers }));
    if (!ticketList.ok) {
      await sleep(pacingMs);
      continue;
    }

    const summary = await timed('operations summary', () => fetch(`${apiUrl}/operations/summary`, { headers }));
    if (!summary.ok) {
      await sleep(pacingMs);
      continue;
    }

    const search = await timed('knowledge search', () =>
      fetch(`${apiUrl}/knowledge/search`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: 'login', limit: 5 }),
      }));
    if (!search.ok) {
      await sleep(pacingMs);
      continue;
    }

    const created = await timed('ticket create', () =>
      fetch(`${apiUrl}/tickets`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          subject: `Local staging load ${index}-${Date.now()}`,
          body: 'Safe bounded local staging load ticket.',
          customerEmail: `load-${index}-${Date.now()}@example.test`,
          customerName: 'Local Load',
          priority: 'NORMAL',
        }),
      }));
    const createdBody = await json(created);
    if (createdBody?.ticketId) {
      await timed('ticket detail', () => fetch(`${apiUrl}/tickets/${createdBody.ticketId}`, { headers }));
    }
    await sleep(pacingMs);
  }
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[index]);
}

const stopAt = Date.now() + durationSeconds * 1000;
const session = await login();
await Promise.all(Array.from({ length: vus }, (_, index) => vu(index + 1, stopAt, session)));

const errorRate = requests === 0 ? 0 : Number((errors / requests).toFixed(4));
const p95Ms = percentile(durations, 95);
const thresholdFailures = [
  errorRate > maxErrorRate ? `errorRate ${errorRate} > ${maxErrorRate}` : null,
  p95Ms > maxP95Ms ? `p95Ms ${p95Ms} > ${maxP95Ms}` : null,
].filter(Boolean);

console.log(JSON.stringify({
  event: 'staging.local.load.completed',
  vus,
  durationSeconds,
  pacingMs,
  requests,
  p50Ms: percentile(durations, 50),
  p95Ms,
  p99Ms: percentile(durations, 99),
  errorRate,
  thresholdFailures,
}));

if (thresholdFailures.length > 0) {
  process.exit(1);
}
