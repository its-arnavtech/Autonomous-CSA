import { createHmac } from 'node:crypto';
import { MockEmailProvider } from './mock-email.provider';
import { sanitizeFilename, sanitizeHtml, stableStringify } from './channel-sanitizer';

function sign(payload: unknown, secret = 'test-secret') {
  return `v1=${createHmac('sha256', secret)
    .update(stableStringify(payload))
    .digest('hex')}`;
}

describe('MockEmailProvider', () => {
  const provider = new MockEmailProvider();
  const payload = {
    eventId: 'evt-1',
    type: 'message.received',
    message: {
      messageId: 'msg-1',
      threadId: 'thread-1',
      from: { email: 'Customer@Example.Test', name: 'Customer' },
      to: [{ email: 'support@example.test' }],
      subject: 'Help',
      text: 'Hello',
    },
  };

  it('verifies signed mock webhooks', async () => {
    await expect(
      provider.verifyWebhook({
        payload,
        signatureHeader: sign(payload),
        secretReference: 'mock:test-secret',
      }),
    ).resolves.toMatchObject({
      verified: true,
      providerEventId: 'evt-1',
      eventType: 'message.received',
    });
  });

  it('rejects invalid mock signatures', async () => {
    await expect(
      provider.verifyWebhook({
        payload,
        signatureHeader: sign(payload, 'wrong-secret'),
        secretReference: 'mock:test-secret',
      }),
    ).resolves.toMatchObject({
      verified: false,
      failureCode: 'INVALID_SIGNATURE',
    });
  });

  it('sanitizes dangerous html and filenames', () => {
    expect(sanitizeHtml('<img src="javascript:alert(1)" onerror="x()"><script>x</script>'))
      .not.toContain('script');
    expect(sanitizeHtml('<button onclick="x()">Run</button>')).not.toContain(
      'onclick',
    );
    expect(sanitizeFilename('..\\evil<script>.exe')).toBe('evil_script_.exe');
  });

  it('uses deterministic outbound provider message ids', async () => {
    const first = await provider.sendMessage({
      idempotencyKey: 'draft:one:channel-send:v1',
      textBody: 'Hello',
      recipients: [{ email: 'customer@example.test' }],
      conversation: { externalThreadId: 'thread-1' },
    });
    const second = await provider.sendMessage({
      idempotencyKey: 'draft:one:channel-send:v1',
      textBody: 'Hello again',
      recipients: [{ email: 'customer@example.test' }],
      conversation: { externalThreadId: 'thread-1' },
    });

    expect(first.providerMessageId).toBe(second.providerMessageId);
  });
});
