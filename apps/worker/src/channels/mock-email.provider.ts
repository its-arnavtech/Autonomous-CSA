import { createHmac } from 'node:crypto';

export type SendChannelMessageInput = {
  idempotencyKey: string;
  subject?: string | null;
  textBody: string;
  htmlBody?: string | null;
  recipients: Array<{ email?: string; name?: string; externalId?: string }>;
  conversation: { externalThreadId?: string | null };
  failureMode?: string | null;
};

export type ChannelSendResult = {
  providerMessageId: string;
  acceptedAt: Date;
  deliveryStatus: 'SENT' | 'DELIVERED' | 'ACCEPTED';
  metadata?: Record<string, unknown>;
};

export type ChannelDeliveryError = {
  category:
    | 'AUTHENTICATION'
    | 'RATE_LIMIT'
    | 'PROVIDER_UNAVAILABLE'
    | 'TIMEOUT'
    | 'INVALID_RECIPIENT'
    | 'INVALID_CONTENT'
    | 'CONNECTION_DISABLED'
    | 'CONFIGURATION_ERROR'
    | 'MALFORMED_RESPONSE'
    | 'UNKNOWN';
  retryable: boolean;
  message: string;
  providerStatusCode?: number;
  providerErrorCode?: string;
};

export class MockEmailProvider {
  async sendMessage(input: SendChannelMessageInput): Promise<ChannelSendResult> {
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
        recipientCount: input.recipients.length,
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
      message: (record.message ?? 'Unknown provider error').slice(0, 500),
      providerStatusCode: record.providerStatusCode,
      providerErrorCode: record.providerErrorCode,
    };
  }
}
