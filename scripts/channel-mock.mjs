import { createHmac } from 'node:crypto';

const action = process.argv[2] ?? 'inbound';
const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:3001';
const publicId = process.env.CHANNEL_CONNECTION_PUBLIC_ID;
const secret = process.env.MOCK_CHANNEL_WEBHOOK_SECRET ?? 'mock-webhook-secret';

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
}

function sign(payload, signingSecret = secret) {
  return `v1=${createHmac('sha256', signingSecret)
    .update(stableStringify(payload))
    .digest('hex')}`;
}

function baseInbound(overrides = {}) {
  return {
    eventId: overrides.eventId ?? 'mock-event-phase12-001',
    type: 'message.received',
    occurredAt: '2026-06-16T00:00:00.000Z',
    message: {
      messageId: overrides.messageId ?? 'mock-message-phase12-001',
      threadId: overrides.threadId ?? 'mock-thread-phase12-001',
      from: {
        email: 'customer@example.test',
        name: 'Example Customer',
        id: 'mock-customer-001',
      },
      to: [{ email: 'support@example.test', name: 'Support' }],
      subject: overrides.subject ?? 'Mock channel request',
      text: overrides.text ?? 'Hello from the deterministic mock channel.',
      html:
        overrides.html ??
        '<p>Hello from the deterministic <strong>mock</strong> channel.</p>',
      inReplyTo: overrides.inReplyTo,
      references: overrides.references ?? [],
      attachments: overrides.attachments ?? [],
    },
  };
}

function payloadFor(name) {
  switch (name) {
    case 'duplicate':
      return baseInbound();
    case 'reply':
      return baseInbound({
        eventId: 'mock-event-phase12-reply-001',
        messageId: 'mock-message-phase12-reply-001',
        text: 'Following up on the same thread.',
      });
    case 'attachment':
      return baseInbound({
        eventId: 'mock-event-phase12-attachment-001',
        messageId: 'mock-message-phase12-attachment-001',
        attachments: [
          {
            id: 'mock-attachment-001',
            filename: '..\\invoice.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 12345,
            contentDisposition: 'attachment',
            checksum: 'sha256:mock',
          },
        ],
      });
    case 'delivery': {
      const providerMessageId =
        process.env.MOCK_PROVIDER_MESSAGE_ID ?? 'mock-out-placeholder';
      return {
        eventId: `mock-delivery-${providerMessageId}`,
        type: 'delivery.delivered',
        occurredAt: '2026-06-16T00:05:00.000Z',
        delivery: {
          providerMessageId,
          status: 'delivered',
        },
      };
    }
    case 'invalid-signature':
    case 'inbound':
    default:
      return baseInbound();
  }
}

if (!publicId) {
  console.error('CHANNEL_CONNECTION_PUBLIC_ID is required.');
  process.exit(2);
}

const payload = payloadFor(action);
const signature =
  action === 'invalid-signature' ? sign(payload, 'wrong-secret') : sign(payload);
const response = await fetch(
  `${apiBaseUrl.replace(/\/+$/, '')}/webhooks/channels/${encodeURIComponent(
    publicId,
  )}`,
  {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-channel-signature': signature,
    },
    body: JSON.stringify(payload),
  },
);
const text = await response.text();
const expectedFailure = action === 'invalid-signature';
const ok = expectedFailure ? response.status === 403 : response.ok;

console.log(
  JSON.stringify(
    {
      action,
      status: response.status,
      ok,
      body: text ? JSON.parse(text) : null,
    },
    null,
    2,
  ),
);

if (!ok) {
  process.exit(1);
}
