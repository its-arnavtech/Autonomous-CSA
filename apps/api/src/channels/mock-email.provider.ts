import { createHmac, timingSafeEqual } from 'node:crypto';
import { ChannelProvider } from '@agentic-support/db';
import {
  ChannelDeliveryError,
  ChannelSendResult,
  ParsedChannelEvent,
  SendChannelMessageInput,
  SupportChannelProvider,
  VerifiedWebhookResult,
  VerifyWebhookInput,
} from './channel-provider.interface';
import {
  sanitizeFilename,
  sanitizeSubject,
  stableStringify,
  truncateText,
} from './channel-sanitizer';

type MockPayload = {
  eventId?: string;
  type?: string;
  occurredAt?: string;
  message?: {
    messageId?: string;
    threadId?: string;
    from?: { email?: string; name?: string; id?: string };
    to?: Array<{ email?: string; name?: string; id?: string }>;
    subject?: string;
    text?: string;
    html?: string;
    inReplyTo?: string;
    references?: string[];
    attachments?: Array<{
      id?: string;
      filename?: string;
      mimeType?: string;
      sizeBytes?: number;
      contentDisposition?: string;
      contentId?: string;
      checksum?: string;
    }>;
  };
  delivery?: {
    providerMessageId?: string;
    status?: 'accepted' | 'sent' | 'delivered' | 'bounced' | 'rejected' | 'failed';
  };
};

function extractSecret(secretReference?: string | null) {
  const reference = secretReference?.trim();
  if (!reference) {
    return process.env.MOCK_CHANNEL_WEBHOOK_SECRET?.trim() || 'mock-webhook-secret';
  }

  return reference.startsWith('mock:')
    ? reference.slice('mock:'.length)
    : reference;
}

function hmac(payload: unknown, secret: string) {
  const h = createHmac('sha256', secret);
  if (Buffer.isBuffer(payload)) {
    h.update(payload);
  } else {
    h.update(stableStringify(payload));
  }
  return h.digest('hex');
}

function safeEqualHex(left: string, right: string) {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export class MockEmailProvider implements SupportChannelProvider {
  readonly providerName = ChannelProvider.MOCK_EMAIL;
  readonly webhookSignatureMode = 'raw-body' as const;

  async verifyWebhook(
    input: VerifyWebhookInput,
  ): Promise<VerifiedWebhookResult> {
    const signature = input.signatureHeader?.trim();
    if (!signature?.startsWith('v1=')) {
      return {
        verified: false,
        failureCode: 'MISSING_SIGNATURE',
        failureMessage: 'Missing mock channel signature',
      };
    }

    if (!input.rawBody) {
      return {
        verified: false,
        failureCode: 'MISSING_RAW_BODY',
        failureMessage: 'Missing raw body for mock channel signature',
      };
    }

    const expected = hmac(input.rawBody, extractSecret(input.secretReference));
    const supplied = signature.slice(3);
    if (!/^[a-f0-9]{64}$/i.test(supplied) || !safeEqualHex(expected, supplied)) {
      return {
        verified: false,
        failureCode: 'INVALID_SIGNATURE',
        failureMessage: 'Invalid mock channel signature',
      };
    }

    const payload = input.payload as MockPayload;
    return {
      verified: true,
      providerEventId: payload.eventId,
      eventType: payload.type,
    };
  }

  async parseEvent(input: { payload: unknown }): Promise<ParsedChannelEvent> {
    const payload = input.payload as MockPayload;
    if (!payload.eventId || !payload.type) {
      throw new Error('Malformed mock event');
    }

    if (payload.type.startsWith('delivery.')) {
      if (!payload.delivery?.providerMessageId || !payload.delivery.status) {
        throw new Error('Malformed mock delivery callback');
      }

      return {
        kind: 'delivery_callback',
        callback: {
          providerEventId: payload.eventId,
          eventType: payload.type,
          providerMessageId: this.normalizeProviderMessageId(
            payload.delivery.providerMessageId,
          ),
          status: payload.delivery.status,
          occurredAt: new Date(payload.occurredAt ?? Date.now()),
          metadata: { provider: 'mock_email' },
        },
      };
    }

    const message = payload.message;
    if (!message?.messageId || !message.from?.email) {
      throw new Error('Malformed mock inbound message');
    }

    return {
      kind: 'inbound',
      inbound: {
        providerEventId: payload.eventId,
        eventType: payload.type,
        providerMessageId: this.normalizeProviderMessageId(message.messageId),
        providerThreadId: message.threadId,
        from: {
          email: message.from.email,
          name: truncateText(message.from.name, 160) ?? undefined,
          externalId: message.from.id,
        },
        recipients:
          message.to?.map((recipient) => ({
            email: recipient.email,
            name: truncateText(recipient.name, 160) ?? undefined,
            externalId: recipient.id,
          })) ?? [],
        subject: sanitizeSubject(message.subject),
        textBody: truncateText(message.text) ?? undefined,
        htmlBody: truncateText(message.html) ?? undefined,
        inReplyTo: message.inReplyTo
          ? this.normalizeProviderMessageId(message.inReplyTo)
          : undefined,
        references: message.references?.map((reference) =>
          this.normalizeProviderMessageId(reference),
        ),
        receivedAt: new Date(payload.occurredAt ?? Date.now()),
        attachments:
          message.attachments?.slice(0, 10).map((attachment) => ({
            providerAttachmentId: attachment.id,
            filename: sanitizeFilename(attachment.filename),
            mimeType: attachment.mimeType ?? 'application/octet-stream',
            sizeBytes: Math.max(0, Math.min(attachment.sizeBytes ?? 0, 25_000_000)),
            contentDisposition: attachment.contentDisposition,
            contentId: attachment.contentId,
            checksum: attachment.checksum,
            metadata: { metadataOnly: true },
          })) ?? [],
        metadata: { provider: 'mock_email' },
      },
    };
  }

  async sendMessage(
    input: SendChannelMessageInput,
  ): Promise<ChannelSendResult> {
    const mode = input.failureMode?.trim().toLowerCase();
    if (mode === 'timeout') {
      throw Object.assign(new Error('Mock provider timeout'), {
        category: 'TIMEOUT',
        retryable: true,
      });
    }
    if (mode === 'retryable' || mode === '429' || mode === '503') {
      throw Object.assign(new Error('Mock provider temporary failure'), {
        category: mode === '429' ? 'RATE_LIMIT' : 'PROVIDER_UNAVAILABLE',
        retryable: true,
        providerStatusCode: mode === '429' ? 429 : 503,
      });
    }
    if (mode === 'permanent' || mode === 'invalid_recipient') {
      throw Object.assign(new Error('Mock provider permanent failure'), {
        category: 'INVALID_RECIPIENT',
        retryable: false,
        providerStatusCode: 400,
      });
    }
    if (mode === 'malformed') {
      throw Object.assign(new Error('Mock provider malformed response'), {
        category: 'MALFORMED_RESPONSE',
        retryable: false,
      });
    }

    const providerMessageId = `mock-out-${createHmac('sha256', 'mock-send')
      .update(input.idempotencyKey)
      .digest('hex')
      .slice(0, 24)}`;

    return {
      providerMessageId,
      acceptedAt: new Date(),
      deliveryStatus: mode === 'delivered' ? 'DELIVERED' : 'SENT',
      metadata: {
        threadId: input.conversation.externalThreadId ?? null,
        recipients: input.recipients.length,
      },
    };
  }

  classifyError(error: unknown): ChannelDeliveryError {
    const record = error as {
      category?: ChannelDeliveryError['category'];
      retryable?: boolean;
      providerStatusCode?: number;
      providerErrorCode?: string;
      message?: string;
    };

    return {
      category: record.category ?? 'UNKNOWN',
      retryable: record.retryable ?? false,
      message: truncateText(record.message, 500) ?? 'Unknown provider error',
      providerStatusCode: record.providerStatusCode,
      providerErrorCode: record.providerErrorCode,
    };
  }

  normalizeProviderMessageId(value: string) {
    return value.trim().toLowerCase();
  }

  async healthCheck() {
    return { ok: true, details: { provider: 'mock_email' } };
  }
}
