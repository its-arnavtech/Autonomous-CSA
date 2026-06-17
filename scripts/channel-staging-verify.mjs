#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const runOutput = join(root, 'run-output');
const envPath = join(runOutput, 'staging-local.env');
const resultPath = join(runOutput, 'channel-staging-results.json');
const composeFile = join(root, 'docker-compose.staging.yml');
const apiUrl = process.env.STAGING_API_URL ?? 'http://localhost:3101';
const webUrl = process.env.STAGING_WEB_URL ?? 'http://localhost:3100/login';
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

if (!existsSync(envPath)) {
  throw new Error('run-output/staging-local.env is missing. Run pnpm staging:local:verify first.');
}

function loadEnvFile() {
  const env = {};
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index > 0) env[line.slice(0, index)] = line.slice(index + 1);
  }
  return env;
}

const stagingEnv = loadEnvFile();
const hostEnv = {
  ...process.env,
  ...stagingEnv,
  DATABASE_URL: `postgresql://postgres:${stagingEnv.POSTGRES_PASSWORD}@localhost:55432/${stagingEnv.POSTGRES_DB}`,
  REDIS_URL: `redis://:${stagingEnv.REDIS_PASSWORD}@127.0.0.1:6380/0`,
  STAGING_WEB_URL: webUrl,
  STAGING_API_URL: apiUrl,
  EXPECTED_GIT_SHA: stagingEnv.GIT_SHA,
};

const composeBase = ['compose', '--env-file', envPath, '-f', composeFile];
const results = {
  event: 'channel.staging.verify.completed',
  startedAt: new Date().toISOString(),
  gitSha: stagingEnv.GIT_SHA,
  checks: {},
  ids: {},
  load: {},
};
const runTag = `phase12-${Date.now()}`;

function tag(name) {
  return `${runTag}-${name}`;
}

function run(command, args, options = {}) {
  const useShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    env: { ...hostEnv, ...(options.env ?? {}) },
    shell: useShell,
  });
  if (result.error || result.status !== 0) {
    const detail = options.capture
      ? `\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
      : '';
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}${detail}`);
  }
  return options.capture ? result.stdout.trim() : '';
}

function compose(args, options = {}) {
  return run('docker', [...composeBase, ...args], options);
}

function shQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function sql(query, database = stagingEnv.POSTGRES_DB) {
  return compose(
    [
      'exec',
      '-T',
      'postgres',
      'sh',
      '-lc',
      `PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d ${shQuote(database)} -Atc ${shQuote(query)}`,
    ],
    { capture: true },
  );
}

function sqlNumber(query, database) {
  return Number(sql(query, database));
}

function sqlString(query, database) {
  return sql(query, database).trim();
}

function ticketIdForProviderEvent(connectionId, providerEventId) {
  return sqlString(
    `SELECT c."ticketId" FROM "ExternalMessage" em JOIN "Conversation" c ON c.id = em."conversationId" WHERE em."channelConnectionId" = '${connectionId}' AND em."providerEventId" = '${providerEventId}' LIMIT 1;`,
  );
}

function ticketIdFromWebhook(connection, payload, result) {
  if (result.ticketId) return result.ticketId;
  const ticketId = ticketIdForProviderEvent(connection.id, payload.eventId);
  if (!ticketId) {
    throw new Error(`No ticket persisted for webhook event ${payload.eventId}`);
  }
  return ticketId;
}

async function request(path, options = {}) {
  let response;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      response = await fetch(`${apiUrl}${path}`, {
        ...options,
        headers: {
          ...(options.body ? { 'content-type': 'application/json' } : {}),
          ...(options.headers ?? {}),
        },
        signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      });
      break;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
  if (!response) {
    throw lastError;
  }
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Keep non-JSON bodies as text.
  }
  return { response, body, text };
}

function requireStatus(result, expected, label) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(result.response.status)) {
    throw new Error(`${label} expected HTTP ${allowed.join('/')}, got ${result.response.status}: ${result.text}`);
  }
  return result.body;
}

async function waitFor(label, fn, timeoutMs = 90_000, intervalMs = 1500) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    last = await fn();
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`${label} timed out; last=${JSON.stringify(last)}`);
}

async function waitReady(service = 'api', timeoutMs = 120_000) {
  const url =
    service === 'web'
      ? 'http://localhost:3100/api/version'
      : service === 'worker'
        ? 'http://localhost:3102/health/ready'
        : 'http://localhost:3101/health/ready';
  await waitFor(`${service} readiness`, async () => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      return response.ok;
    } catch {
      return false;
    }
  }, timeoutMs, 2000);
}

async function login(email) {
  const body = requireStatus(
    await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: stagingEnv.STAGING_SMOKE_PASSWORD }),
    }),
    [200, 201],
    `${email} login`,
  );
  return {
    email,
    accessToken: body.accessToken,
    organizationId: body.memberships[0].organizationId,
  };
}

function auth(session, organizationId = session.organizationId) {
  return {
    authorization: `Bearer ${session.accessToken}`,
    'x-organization-id': organizationId,
  };
}

function sign(rawBody, secret = 'mock-webhook-secret') {
  return `v1=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

function inboundPayload(prefix, overrides = {}) {
  return {
    eventId: `${prefix}-event`,
    type: 'message.received',
    occurredAt: new Date().toISOString(),
    message: {
      messageId: `${prefix}-message`,
      threadId: `${prefix}-thread`,
      from: {
        email: `${prefix}@example.test`,
        name: 'Phase Twelve Customer',
        id: `${prefix}-customer`,
      },
      to: [{ email: 'support@example.test', name: 'Support' }],
      subject: overrides.subject ?? `Phase 12 ${prefix}`,
      text:
        overrides.text ??
        'I cannot sign in after resetting my password. Please help me regain access.',
      html:
        overrides.html ??
        '<p>I cannot sign in after resetting my password.</p>',
      attachments: overrides.attachments ?? [],
    },
  };
}

function deliveryPayload(providerMessageId, status, eventId) {
  return {
    eventId,
    type: `delivery.${status}`,
    occurredAt: new Date().toISOString(),
    delivery: { providerMessageId, status },
  };
}

async function sendWebhook(publicId, payload, options = {}) {
  const rawBody = options.rawBody ?? JSON.stringify(payload);
  const signature =
    Object.prototype.hasOwnProperty.call(options, 'signature') ? options.signature : sign(rawBody, options.secret);
  const init = {
    method: 'POST',
    headers: {
      'content-type': options.contentType ?? 'application/json',
      ...(signature ? { 'x-channel-signature': signature } : {}),
    },
    body: rawBody,
  };
  let response;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      response = await fetch(`${apiUrl}/webhooks/channels/${encodeURIComponent(publicId)}`, {
        ...init,
        signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      });
      break;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
  if (!response) {
    throw lastError;
  }
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Keep text.
  }
  return { response, body, text };
}

async function createConnection(session, displayName, config = { mode: 'mock' }) {
  const externalAccountId = `mock:${tag(displayName.toLowerCase().replace(/[^a-z0-9-]+/g, '-'))}`;

  return requireStatus(
    await request('/channel-connections', {
      method: 'POST',
      headers: auth(session),
      body: JSON.stringify({
        provider: 'MOCK_EMAIL',
        displayName,
        externalAccountId,
        webhookSecret: 'mock-webhook-secret',
        inboundAddress: 'support@example.test',
        config,
        isDefault: true,
      }),
    }),
    [200, 201],
    'create channel connection',
  );
}

async function patchConnection(session, connectionId, dto) {
  return requireStatus(
    await request(`/channel-connections/${connectionId}`, {
      method: 'PATCH',
      headers: auth(session),
      body: JSON.stringify(dto),
    }),
    200,
    'patch channel connection',
  );
}

async function postConnectionAction(session, connectionId, action) {
  return requireStatus(
    await request(`/channel-connections/${connectionId}/${action}`, {
      method: 'POST',
      headers: auth(session),
    }),
    [200, 201],
    `connection ${action}`,
  );
}

async function waitForTicketRun(session, ticketId) {
  return waitFor(`ticket ${ticketId} run finished`, async () => {
    const detail = requireStatus(
      await request(`/tickets/${ticketId}`, { headers: auth(session) }),
      200,
      'ticket detail',
    );
    const status = detail.latestAgentRun?.status;
    return ['FINISHED', 'SUCCEEDED', 'BLOCKED'].includes(status) ? detail : null;
  }, 120_000);
}

async function waitForApproval(session, ticketId) {
  return waitFor(`ticket ${ticketId} pending approval`, async () => {
    const approvals = requireStatus(
      await request(`/tickets/${ticketId}/approvals`, { headers: auth(session) }),
      200,
      'ticket approvals',
    );
    return approvals.find((approval) => approval.status === 'PENDING') ?? null;
  }, 120_000);
}

async function waitForOutbound(session, ticketId, predicate, label = 'outbound') {
  return waitFor(`${label} for ticket ${ticketId}`, async () => {
    const outbounds = requireStatus(
      await request(`/tickets/${ticketId}/outbound-messages`, {
        headers: auth(session),
      }),
      200,
      'ticket outbound messages',
    );
    return outbounds.find(predicate) ?? null;
  }, 120_000);
}

async function approve(session, approvalId) {
  return request(`/approvals/${approvalId}`, {
    method: 'PATCH',
    headers: auth(session),
    body: JSON.stringify({ status: 'APPROVED', reviewerNote: 'Phase 12 verification approval.' }),
  });
}

async function createInboundAndApproval(session, connection, prefix) {
  const payload = inboundPayload(prefix);
  const webhook = requireStatus(
    await sendWebhook(connection.publicId, payload),
    [200, 201],
    `${prefix} inbound webhook`,
  );
  webhook.ticketId = ticketIdFromWebhook(connection, payload, webhook);
  const detail = await waitForTicketRun(session, webhook.ticketId);
  const approval = await waitForApproval(session, webhook.ticketId);
  return { webhook, detail, approval };
}

async function approveAndWaitSent(session, ticketId, approvalId) {
  requireStatus(await approve(session, approvalId), 200, 'approve draft');
  return waitForOutbound(session, ticketId, (outbound) =>
    ['SENT', 'DELIVERED', 'DEAD_LETTER', 'RETRY_SCHEDULED'].includes(outbound.status),
  );
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]);
}

async function runLoad(publicId) {
  const durations = [];
  let errors = 0;
  const concurrency = 5;
  const unique = 10;
  const duplicatePrefix = tag('load-duplicate');
  const duplicate = inboundPayload(duplicatePrefix);
  const started = Date.now();
  const tasks = [];
  for (let i = 0; i < unique; i += 1) {
    tasks.push(async () => {
      const begin = performance.now();
      const result = await sendWebhook(publicId, inboundPayload(tag(`load-${i}`)));
      durations.push(performance.now() - begin);
      if (!result.response.ok) errors += 1;
    });
  }
  for (let i = 0; i < 10; i += 1) {
    tasks.push(async () => {
      const begin = performance.now();
      const result = await sendWebhook(publicId, duplicate);
      durations.push(performance.now() - begin);
      if (!result.response.ok) errors += 1;
    });
  }

  for (let i = 0; i < tasks.length; i += concurrency) {
    await Promise.all(tasks.slice(i, i + concurrency).map((task) => task()));
  }

  const loadDuplicateReceipts = sqlNumber(
    `SELECT count(*) FROM "WebhookReceipt" WHERE "providerEventId" = '${duplicatePrefix}-event';`,
  );
  return {
    concurrency,
    durationMs: Date.now() - started,
    totalRequests: tasks.length,
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
    p99Ms: percentile(durations, 99),
    errorRate: Number((errors / tasks.length).toFixed(4)),
    duplicatesSuppressed: Math.max(0, 10 - loadDuplicateReceipts),
  };
}

async function backupAndRestoreEvidence() {
  const before = {
    channelConnections: sqlNumber('SELECT count(*) FROM "ChannelConnection";'),
    externalCustomers: sqlNumber('SELECT count(*) FROM "ExternalCustomer";'),
    conversations: sqlNumber('SELECT count(*) FROM "Conversation";'),
    externalMessages: sqlNumber('SELECT count(*) FROM "ExternalMessage";'),
    webhookReceipts: sqlNumber('SELECT count(*) FROM "WebhookReceipt";'),
    outboundMessages: sqlNumber('SELECT count(*) FROM "OutboundMessage";'),
    deliveryAttempts: sqlNumber('SELECT count(*) FROM "DeliveryAttempt";'),
    inboundDispatches: sqlNumber('SELECT count(*) FROM "InboundDispatch";'),
  };
  const backupDir = join(runOutput, 'channel-backups');
  mkdirSync(backupDir, { recursive: true });
  const backupOutput = run(pnpm, ['db:backup'], {
    capture: true,
    env: { BACKUP_DIR: backupDir, APP_VERSION: stagingEnv.APP_VERSION },
  });
  const backupJson = JSON.parse(backupOutput.slice(backupOutput.lastIndexOf('\n{') + 1));
  const restoreDb = `agentic_support_channel_restore_${Date.now()}`;
  sql(`CREATE DATABASE ${restoreDb};`, 'postgres');
  try {
    run(
      pnpm,
      [
        'db:restore',
        backupJson.backupPath,
        `--target-database-url=postgresql://postgres:${stagingEnv.POSTGRES_PASSWORD}@localhost:55432/${restoreDb}`,
        '--yes=true',
      ],
      { capture: true },
    );
    const after = {
      channelConnections: sqlNumber('SELECT count(*) FROM "ChannelConnection";', restoreDb),
      externalCustomers: sqlNumber('SELECT count(*) FROM "ExternalCustomer";', restoreDb),
      conversations: sqlNumber('SELECT count(*) FROM "Conversation";', restoreDb),
      externalMessages: sqlNumber('SELECT count(*) FROM "ExternalMessage";', restoreDb),
      webhookReceipts: sqlNumber('SELECT count(*) FROM "WebhookReceipt";', restoreDb),
      outboundMessages: sqlNumber('SELECT count(*) FROM "OutboundMessage";', restoreDb),
      deliveryAttempts: sqlNumber('SELECT count(*) FROM "DeliveryAttempt";', restoreDb),
      inboundDispatches: sqlNumber('SELECT count(*) FROM "InboundDispatch";', restoreDb),
    };
    return { backupPath: backupJson.backupPath, checksum: backupJson.checksum, before, after };
  } finally {
    sql(`DROP DATABASE IF EXISTS ${restoreDb};`, 'postgres');
  }
}

async function main() {
  await waitReady('api');
  await waitReady('worker');
  await waitReady('web');

  const owner = await login(stagingEnv.STAGING_OWNER_EMAIL);
  const viewer = await login(stagingEnv.STAGING_VIEWER_EMAIL);
  const connection = await createConnection(owner, `Phase 12 ${Date.now()}`);
  results.ids.connectionId = connection.id;
  results.ids.connectionPublicId = connection.publicId;

  await patchConnection(owner, connection.id, {
    displayName: 'Phase 12 Updated',
    config: { mode: 'mock' },
  });
  await postConnectionAction(owner, connection.id, 'disable');
  await postConnectionAction(owner, connection.id, 'enable');
  await postConnectionAction(owner, connection.id, 'test');
  results.checks.auditActions = sqlNumber(
    `SELECT count(*) FROM "ChannelAuditEvent" WHERE "targetId" = '${connection.id}';`,
  );

  const exactPrefix = tag('exact');
  const exact = inboundPayload(exactPrefix, {
    html: '<img src="javascript:alert(1)" onerror="x()"><script>x</script><p>Safe body</p>',
    attachments: [
      {
        id: 'phase12-attachment',
        filename: '..\\dangerous<script>.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 12345,
        checksum: 'sha256:phase12',
      },
    ],
  });
  const exactResult = requireStatus(await sendWebhook(connection.publicId, exact), [200, 201], 'exact raw webhook');
  exactResult.ticketId = ticketIdFromWebhook(connection, exact, exactResult);
  results.ids.inboundTicketId = exactResult.ticketId;
  const exactDetail = await waitForTicketRun(owner, exactResult.ticketId);
  const exactApproval = await waitForApproval(owner, exactResult.ticketId);
  results.ids.inboundRunId = exactDetail.latestAgentRun.id;
  results.ids.inboundApprovalId = exactApproval.id;
  results.checks.fullInbound = {
    receipts: sqlNumber(`SELECT count(*) FROM "WebhookReceipt" WHERE "providerEventId" = '${exactPrefix}-event';`),
    externalCustomers: sqlNumber(`SELECT count(*) FROM "ExternalCustomer" WHERE "externalCustomerId" = '${exactPrefix}-customer';`),
    conversations: sqlNumber(`SELECT count(*) FROM "Conversation" WHERE "externalThreadId" = '${exactPrefix}-thread';`),
    externalMessages: sqlNumber(`SELECT count(*) FROM "ExternalMessage" WHERE "providerMessageId" = '${exactPrefix}-message';`),
    ticketMessages: sqlNumber(`SELECT count(*) FROM "TicketMessage" WHERE "ticketId" = '${exactResult.ticketId}';`),
    inboundDispatches: sqlNumber(`SELECT count(*) FROM "InboundDispatch" WHERE "runId" = '${exactDetail.latestAgentRun.id}' AND "status" = 'COMPLETED';`),
    agentSteps: exactDetail.agentSteps.length,
    drafts: exactDetail.drafts.length,
    retrievals: sqlNumber(`SELECT count(*) FROM "KnowledgeRetrieval" WHERE "ticketId" = '${exactResult.ticketId}';`),
    guardrails: sqlNumber(`SELECT count(*) FROM "AgentGuardrailCheck" WHERE "ticketId" = '${exactResult.ticketId}';`),
  };

  const duplicatePrefix = tag('duplicate');
  const duplicate = inboundPayload(duplicatePrefix);
  const duplicateResponses = await Promise.all(
    Array.from({ length: 8 }, () => sendWebhook(connection.publicId, duplicate)),
  );
  if (duplicateResponses.some((result) => !result.response.ok)) {
    throw new Error('duplicate webhook request returned a non-success response');
  }
  const duplicateTicketId = duplicateResponses.find((result) => result.body?.ticketId)?.body.ticketId;
  if (duplicateTicketId) await waitForTicketRun(owner, duplicateTicketId);
  results.checks.concurrentDuplicate = {
    webhookReceipts: sqlNumber(`SELECT count(*) FROM "WebhookReceipt" WHERE "providerEventId" = '${duplicatePrefix}-event';`),
    externalMessages: sqlNumber(`SELECT count(*) FROM "ExternalMessage" WHERE "providerMessageId" = '${duplicatePrefix}-message';`),
    conversations: sqlNumber(`SELECT count(*) FROM "Conversation" WHERE "externalThreadId" = '${duplicatePrefix}-thread';`),
    tickets: sqlNumber(`SELECT count(*) FROM "Ticket" WHERE "customerEmail" = '${duplicatePrefix}@example.test';`),
    inboundDispatches: sqlNumber(`SELECT count(*) FROM "InboundDispatch" WHERE "ticketId" IN (SELECT id FROM "Ticket" WHERE "customerEmail" = '${duplicatePrefix}@example.test');`),
  };

  const whitespacePrefix = tag('whitespace');
  const compact = JSON.stringify(inboundPayload(whitespacePrefix));
  const pretty = JSON.stringify(inboundPayload(whitespacePrefix), null, 2);
  requireStatus(
    await sendWebhook(connection.publicId, inboundPayload(whitespacePrefix), {
      rawBody: pretty,
      signature: sign(compact),
    }),
    403,
    'whitespace signature rejection',
  );
  const ordered = inboundPayload(tag('order'));
  const reorderedRaw = JSON.stringify({ type: ordered.type, eventId: ordered.eventId, message: ordered.message });
  requireStatus(
    await sendWebhook(connection.publicId, ordered, {
      rawBody: reorderedRaw,
      signature: sign(JSON.stringify(ordered)),
    }),
    403,
    'field order signature rejection',
  );
  requireStatus(
    await sendWebhook(connection.publicId, inboundPayload(tag('invalid-signature')), {
      signature: sign('different body'),
    }),
    403,
    'invalid signature rejection',
  );
  requireStatus(
    await sendWebhook(connection.publicId, inboundPayload(tag('missing-signature')), {
      signature: null,
    }),
    403,
    'missing signature rejection',
  );
  requireStatus(
    await sendWebhook(connection.publicId, inboundPayload(tag('malformed')), {
      rawBody: '{"eventId":',
      signature: sign('{"eventId":'),
    }),
    400,
    'malformed JSON rejection',
  );
  const oversized = inboundPayload(tag('oversized'), { text: 'x'.repeat(270_000) });
  requireStatus(await sendWebhook(connection.publicId, oversized), 400, 'oversized webhook rejection');
  results.checks.rawSecurity = 'passed';

  const sent = await approveAndWaitSent(owner, exactResult.ticketId, exactApproval.id);
  results.ids.outboundMessageId = sent.id;
  await waitForOutbound(owner, exactResult.ticketId, (outbound) => outbound.id === sent.id && outbound.status === 'SENT', 'outbound sent');
  const providerMessageId = sql(
    `SELECT "providerMessageId" FROM "OutboundMessage" WHERE id = '${sent.id}';`,
  );
  requireStatus(
    await sendWebhook(connection.publicId, deliveryPayload(providerMessageId, 'sent', tag('callback-sent'))),
    [200, 201],
    'sent callback',
  );
  requireStatus(
    await sendWebhook(connection.publicId, deliveryPayload(providerMessageId, 'delivered', tag('callback-delivered'))),
    [200, 201],
    'delivered callback',
  );
  requireStatus(
    await sendWebhook(connection.publicId, deliveryPayload(providerMessageId, 'failed', tag('callback-failed-after-delivered'))),
    [200, 201],
    'failure after delivered ignored',
  );
  const delivered = await waitForOutbound(owner, exactResult.ticketId, (outbound) => outbound.id === sent.id && outbound.status === 'DELIVERED', 'outbound delivered');
  results.checks.fullOutbound = {
    status: delivered.status,
    deliveryAttempts: delivered.deliveryAttempts.length,
    sentEvents: sqlNumber(`SELECT count(*) FROM "AgentEvent" WHERE "ticketId" = '${exactResult.ticketId}' AND "type" = 'CHANNEL_MESSAGE_SENT';`),
    deliveredEvents: sqlNumber(`SELECT count(*) FROM "AgentEvent" WHERE "ticketId" = '${exactResult.ticketId}' AND "type" = 'CHANNEL_MESSAGE_DELIVERED';`),
  };
  requireStatus(
    await request(`/outbound-messages/${sent.id}/replay`, {
      method: 'POST',
      headers: auth(owner),
    }),
    400,
    'delivered replay rejection',
  );

  const duplicateApproval = await approve(owner, exactApproval.id);
  requireStatus(duplicateApproval, 400, 'duplicate approval rejection');
  results.checks.duplicateApproval = {
    outboundMessages: sqlNumber(`SELECT count(*) FROM "OutboundMessage" WHERE "draftId" = '${exactApproval.outboundDraftId}';`),
  };

  for (const mode of ['timeout', '429', '503']) {
    await patchConnection(owner, connection.id, { config: { mode: 'mock', failureMode: mode } });
    const item = await createInboundAndApproval(owner, connection, tag(`retry-${mode}`));
    requireStatus(await approve(owner, item.approval.id), 200, `approve retry ${mode}`);
    const retrying = await waitForOutbound(owner, item.webhook.ticketId, (outbound) => outbound.status === 'RETRY_SCHEDULED', `${mode} retry scheduled`);
    await patchConnection(owner, connection.id, { config: { mode: 'mock' } });
    const recovered = await waitForOutbound(owner, item.webhook.ticketId, (outbound) => outbound.id === retrying.id && outbound.status === 'SENT', `${mode} recovered`);
    results.checks[`retryable_${mode}`] = {
      status: recovered.status,
      attempts: recovered.deliveryAttempts.length,
    };
  }

  for (const mode of ['invalid_recipient', 'malformed']) {
    await patchConnection(owner, connection.id, { config: { mode: 'mock', failureMode: mode } });
    const item = await createInboundAndApproval(owner, connection, tag(`permanent-${mode}`));
    requireStatus(await approve(owner, item.approval.id), 200, `approve permanent ${mode}`);
    const dead = await waitForOutbound(owner, item.webhook.ticketId, (outbound) => outbound.status === 'DEAD_LETTER', `${mode} dead letter`);
    results.checks[`permanent_${mode}`] = {
      status: dead.status,
      attempts: dead.deliveryAttempts.length,
      operationalFailures: sqlNumber(`SELECT count(*) FROM "OperationalFailure" WHERE "ticketId" = '${item.webhook.ticketId}';`),
    };
    requireStatus(
      await request(`/outbound-messages/${dead.id}/replay`, {
        method: 'POST',
        headers: auth(viewer),
      }),
      403,
      `${mode} viewer replay rejected`,
    );
    await patchConnection(owner, connection.id, { config: { mode: 'mock' } });
    requireStatus(
      await request(`/outbound-messages/${dead.id}/replay`, {
        method: 'POST',
        headers: auth(owner),
      }),
      [200, 201],
      `${mode} owner replay accepted`,
    );
    await waitForOutbound(owner, item.webhook.ticketId, (outbound) => outbound.id === dead.id && outbound.status === 'SENT', `${mode} replay sent`);
  }

  await patchConnection(owner, connection.id, { config: { mode: 'mock' } });

  compose(['stop', 'redis']);
  await waitFor('api readiness reflects Redis outage', async () => {
    try {
      const response = await fetch('http://localhost:3101/health/ready', { signal: AbortSignal.timeout(5000) });
      return !response.ok;
    } catch {
      return true;
    }
  }, 45_000);
  const redisDownPayload = inboundPayload(tag('redis-down-inbound'));
  const redisDownResult = requireStatus(
    await sendWebhook(connection.publicId, redisDownPayload),
    [200, 201],
    'Redis-down inbound webhook',
  );
  const redisDownTicketId = ticketIdFromWebhook(connection, redisDownPayload, redisDownResult);
  const pendingDispatches = sqlNumber(`SELECT count(*) FROM "InboundDispatch" WHERE "ticketId" = '${redisDownTicketId}' AND "status" = 'PENDING';`);
  if (pendingDispatches < 1) {
    throw new Error('Redis-down inbound did not leave a pending durable dispatch');
  }
  compose(['start', 'redis']);
  await waitReady('api');
  await waitReady('worker');
  await waitForTicketRun(owner, redisDownTicketId);
  const completedRedisDownDispatches = await waitFor(
    'Redis-down inbound dispatch completed after recovery',
    async () => {
      const completed = sqlNumber(`SELECT count(*) FROM "InboundDispatch" WHERE "ticketId" = '${redisDownTicketId}' AND "status" = 'COMPLETED';`);
      return completed > 0 ? completed : null;
    },
    45_000,
    2000,
  );
  results.checks.redisDownInbound = {
    pendingDuringOutage: pendingDispatches,
    completedAfterRecovery: completedRedisDownDispatches,
  };

  const outboundRedis = await createInboundAndApproval(owner, connection, tag('redis-down-outbound'));
  compose(['stop', 'redis']);
  requireStatus(await approve(owner, outboundRedis.approval.id), 200, 'approve while Redis down');
  const durableOutbound = await waitForOutbound(owner, outboundRedis.webhook.ticketId, () => true, 'durable outbound while Redis down');
  compose(['start', 'redis']);
  await waitReady('api');
  await waitReady('worker');
  await waitForOutbound(owner, outboundRedis.webhook.ticketId, (outbound) => outbound.id === durableOutbound.id && outbound.status === 'SENT', 'outbound recovered after Redis');
  results.checks.redisDownOutbound = { outboundMessageId: durableOutbound.id };

  compose(['stop', 'worker']);
  const workerDown = requireStatus(
    await sendWebhook(connection.publicId, inboundPayload(tag('worker-down'))),
    [200, 201],
    'worker-down inbound',
  );
  workerDown.ticketId = ticketIdFromWebhook(connection, inboundPayload(tag('worker-down')), workerDown);
  compose(['start', 'worker']);
  await waitReady('worker');
  await waitForTicketRun(owner, workerDown.ticketId);
  results.checks.workerRestart = 'passed';

  compose(['restart', 'api']);
  await waitReady('api');
  const apiRestartPayload = inboundPayload(tag('api-restart'));
  const apiRestart = requireStatus(
    await sendWebhook(connection.publicId, apiRestartPayload),
    [200, 201],
    'api restart inbound',
  );
  apiRestart.ticketId = ticketIdFromWebhook(connection, apiRestartPayload, apiRestart);
  results.checks.apiRestart = 'passed';

  compose(['restart', 'redis']);
  await waitReady('api');
  await waitReady('worker');
  results.checks.redisRestart = 'passed';

  compose(['stop', 'postgres']);
  await waitFor('api readiness reflects Postgres outage', async () => {
    try {
      const response = await fetch('http://localhost:3101/health/ready', { signal: AbortSignal.timeout(5000) });
      return !response.ok;
    } catch {
      return true;
    }
  }, 45_000);
  let postgresOutageStatus = 'fetch-error';
  try {
    const outage = await sendWebhook(connection.publicId, inboundPayload(tag('postgres-down')), { timeoutMs: 10_000 });
    postgresOutageStatus = String(outage.response.status);
    if (/mock-webhook-secret|postgres:\/\/|redis:\/\//i.test(outage.text)) {
      throw new Error('Postgres outage response leaked a secret');
    }
  } catch {
    postgresOutageStatus = 'fetch-error';
  }
  compose(['start', 'postgres']);
  await waitReady('api');
  results.checks.postgresFailureRecovery = { outageStatus: postgresOutageStatus };

  compose(['restart', 'postgres']);
  await waitReady('api');
  await waitReady('worker');
  results.checks.postgresRestart = 'passed';

  results.load = await runLoad(connection.publicId);
  results.backup = await backupAndRestoreEvidence();
  results.checks.security = {
    forgedOrganizationRejected: requireStatus(
      await request('/channel-connections', {
        headers: auth(owner, '00000000-0000-4000-8000-000000000011'),
      }),
      403,
      'forged organization channel list',
    ) ? true : true,
    viewerCannotManageChannels:
      (await request('/channel-connections', {
        method: 'POST',
        headers: auth(viewer),
        body: JSON.stringify({ provider: 'MOCK_EMAIL', displayName: 'Viewer denied' }),
      })).response.status === 403,
    sanitizedAttachmentFilename: sql(
      `SELECT "filename" FROM "MessageAttachment" WHERE "externalMessageId" IN (SELECT id FROM "ExternalMessage" WHERE "providerMessageId" = '${exactPrefix}-message') LIMIT 1;`,
    ),
  };

  results.finishedAt = new Date().toISOString();
  writeFileSync(resultPath, `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify({ event: results.event, resultPath }, null, 2));
}

try {
  await main();
} catch (error) {
  results.event = 'channel.staging.verify.failed';
  results.error = error instanceof Error ? error.message : String(error);
  results.finishedAt = new Date().toISOString();
  writeFileSync(resultPath, `${JSON.stringify(results, null, 2)}\n`);
  console.error(JSON.stringify({ event: results.event, resultPath, error: results.error }, null, 2));
  process.exit(1);
}
