import type { ChannelProvider } from '@agentic-support/db';

export type ChannelAddress = {
  email?: string;
  name?: string;
  externalId?: string;
};

export type ParsedAttachmentMetadata = {
  providerAttachmentId?: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  contentDisposition?: string;
  contentId?: string;
  checksum?: string;
  metadata?: Record<string, unknown>;
};

export type ParsedInboundEvent = {
  providerEventId: string;
  eventType: string;
  providerMessageId?: string;
  providerThreadId?: string;
  from: ChannelAddress;
  recipients: ChannelAddress[];
  subject?: string;
  textBody?: string;
  htmlBody?: string;
  inReplyTo?: string;
  references?: string[];
  receivedAt: Date;
  attachments: ParsedAttachmentMetadata[];
  metadata?: Record<string, unknown>;
};

export type ParsedDeliveryCallback = {
  providerEventId: string;
  eventType: string;
  providerMessageId: string;
  status: 'accepted' | 'sent' | 'delivered' | 'bounced' | 'rejected' | 'failed';
  occurredAt: Date;
  metadata?: Record<string, unknown>;
};

export type ParsedChannelEvent =
  | { kind: 'inbound'; inbound: ParsedInboundEvent }
  | { kind: 'delivery_callback'; callback: ParsedDeliveryCallback };

export type VerifyWebhookInput = {
  payload: unknown;
  rawBody?: Buffer;
  signatureHeader?: string | null;
  secretReference?: string | null;
};

export type VerifiedWebhookResult = {
  verified: boolean;
  providerEventId?: string;
  eventType?: string;
  failureCode?: string;
  failureMessage?: string;
};

export type SendChannelMessageInput = {
  idempotencyKey: string;
  subject?: string | null;
  textBody: string;
  htmlBody?: string | null;
  recipients: ChannelAddress[];
  conversation: {
    externalThreadId?: string | null;
  };
  failureMode?: string | null;
};

export type ChannelSendResult = {
  providerMessageId: string;
  acceptedAt: Date;
  deliveryStatus: 'SENT' | 'DELIVERED' | 'ACCEPTED';
  metadata?: Record<string, unknown>;
};

export type ChannelDeliveryErrorCategory =
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

export type ChannelDeliveryError = {
  category: ChannelDeliveryErrorCategory;
  retryable: boolean;
  message: string;
  providerStatusCode?: number;
  providerErrorCode?: string;
};

export interface SupportChannelProvider {
  readonly providerName: ChannelProvider;
  readonly webhookSignatureMode: 'raw-body' | 'canonical-json';
  verifyWebhook(input: VerifyWebhookInput): Promise<VerifiedWebhookResult>;
  parseEvent(input: { payload: unknown }): Promise<ParsedChannelEvent>;
  sendMessage(input: SendChannelMessageInput): Promise<ChannelSendResult>;
  classifyError(error: unknown): ChannelDeliveryError;
  normalizeProviderMessageId(value: string): string;
  healthCheck?(): Promise<{ ok: boolean; details?: Record<string, unknown> }>;
}
