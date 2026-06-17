-- Phase 12: tenant-scoped support channel integration foundation.
-- The migration is additive: existing tickets, drafts, approvals, and timelines are preserved.

ALTER TYPE "AgentEventType" ADD VALUE 'CHANNEL_CONNECTION_CREATED';
ALTER TYPE "AgentEventType" ADD VALUE 'CHANNEL_CONNECTION_UPDATED';
ALTER TYPE "AgentEventType" ADD VALUE 'CHANNEL_CONNECTION_DISABLED';
ALTER TYPE "AgentEventType" ADD VALUE 'CHANNEL_CONNECTION_ENABLED';
ALTER TYPE "AgentEventType" ADD VALUE 'CHANNEL_CONNECTION_TESTED';
ALTER TYPE "AgentEventType" ADD VALUE 'CHANNEL_WEBHOOK_RECEIVED';
ALTER TYPE "AgentEventType" ADD VALUE 'CHANNEL_WEBHOOK_DUPLICATE';
ALTER TYPE "AgentEventType" ADD VALUE 'CHANNEL_WEBHOOK_REJECTED';
ALTER TYPE "AgentEventType" ADD VALUE 'CHANNEL_CUSTOMER_MATCHED';
ALTER TYPE "AgentEventType" ADD VALUE 'CHANNEL_CONVERSATION_CREATED';
ALTER TYPE "AgentEventType" ADD VALUE 'CHANNEL_MESSAGE_RECEIVED';
ALTER TYPE "AgentEventType" ADD VALUE 'CHANNEL_TICKET_CREATED';
ALTER TYPE "AgentEventType" ADD VALUE 'CHANNEL_ATTACHMENT_RECORDED';
ALTER TYPE "AgentEventType" ADD VALUE 'CHANNEL_DRAFT_APPROVED_FOR_DELIVERY';
ALTER TYPE "AgentEventType" ADD VALUE 'CHANNEL_OUTBOUND_QUEUED';
ALTER TYPE "AgentEventType" ADD VALUE 'CHANNEL_DELIVERY_ATTEMPT_STARTED';
ALTER TYPE "AgentEventType" ADD VALUE 'CHANNEL_DELIVERY_RETRY_SCHEDULED';
ALTER TYPE "AgentEventType" ADD VALUE 'CHANNEL_MESSAGE_SENT';
ALTER TYPE "AgentEventType" ADD VALUE 'CHANNEL_MESSAGE_DELIVERED';
ALTER TYPE "AgentEventType" ADD VALUE 'CHANNEL_MESSAGE_FAILED';
ALTER TYPE "AgentEventType" ADD VALUE 'CHANNEL_MESSAGE_DEAD_LETTERED';
ALTER TYPE "AgentEventType" ADD VALUE 'CHANNEL_MESSAGE_REPLAYED';
ALTER TYPE "AgentEventType" ADD VALUE 'CHANNEL_OUTBOUND_CANCELLED';

CREATE TYPE "ChannelProvider" AS ENUM ('MOCK_EMAIL', 'GENERIC_EMAIL');
CREATE TYPE "ChannelConnectionStatus" AS ENUM ('ACTIVE', 'DISABLED', 'ERROR');
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'CLOSED', 'ARCHIVED');
CREATE TYPE "ExternalMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "MessageAttachmentStatus" AS ENUM ('METADATA_ONLY', 'AVAILABLE', 'REJECTED', 'QUARANTINED');
CREATE TYPE "WebhookReceiptStatus" AS ENUM ('RECEIVED', 'VERIFIED', 'PROCESSING', 'PROCESSED', 'DUPLICATE', 'REJECTED', 'FAILED');
CREATE TYPE "OutboundMessageStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'DELIVERED', 'RETRY_SCHEDULED', 'FAILED', 'DEAD_LETTER', 'CANCELLED');
CREATE TYPE "DeliveryAttemptOutcome" AS ENUM ('SUCCEEDED', 'RETRYABLE_FAILURE', 'PERMANENT_FAILURE', 'UNKNOWN');

CREATE TABLE "ChannelConnection" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "provider" "ChannelProvider" NOT NULL,
  "displayName" TEXT NOT NULL,
  "status" "ChannelConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
  "externalAccountId" TEXT,
  "inboundAddress" TEXT,
  "secretReference" TEXT,
  "webhookSigningSecretReference" TEXT,
  "config" JSONB,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "lastSuccessfulEventAt" TIMESTAMP(3),
  "lastErrorAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorRedacted" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "disabledAt" TIMESTAMP(3),

  CONSTRAINT "ChannelConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExternalCustomer" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "channelConnectionId" TEXT NOT NULL,
  "externalCustomerId" TEXT,
  "email" TEXT,
  "normalizedEmail" TEXT,
  "displayName" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExternalCustomer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Conversation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "channelConnectionId" TEXT NOT NULL,
  "externalCustomerId" TEXT,
  "ticketId" TEXT,
  "externalThreadId" TEXT,
  "subject" TEXT,
  "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExternalMessage" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "channelConnectionId" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "providerEventId" TEXT,
  "direction" "ExternalMessageDirection" NOT NULL,
  "sender" JSONB NOT NULL,
  "recipients" JSONB NOT NULL,
  "subject" TEXT,
  "textBody" TEXT,
  "htmlBody" TEXT,
  "sanitizedHtmlBody" TEXT,
  "replyToProviderMessageId" TEXT,
  "inReplyTo" TEXT,
  "references" JSONB,
  "receivedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ExternalMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MessageAttachment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "externalMessageId" TEXT NOT NULL,
  "providerAttachmentId" TEXT,
  "filename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "contentDisposition" TEXT,
  "contentId" TEXT,
  "checksum" TEXT,
  "status" "MessageAttachmentStatus" NOT NULL DEFAULT 'METADATA_ONLY',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MessageAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebhookReceipt" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "channelConnectionId" TEXT NOT NULL,
  "provider" "ChannelProvider" NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "signatureVerified" BOOLEAN NOT NULL DEFAULT false,
  "payloadHash" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "status" "WebhookReceiptStatus" NOT NULL DEFAULT 'RECEIVED',
  "failureCode" TEXT,
  "failureMessageRedacted" TEXT,
  "correlationId" TEXT,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,

  CONSTRAINT "WebhookReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutboundMessage" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "channelConnectionId" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "draftId" TEXT NOT NULL,
  "externalMessageId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "status" "OutboundMessageStatus" NOT NULL DEFAULT 'PENDING',
  "subject" TEXT,
  "textBody" TEXT NOT NULL,
  "htmlBody" TEXT,
  "recipients" JSONB NOT NULL,
  "providerMessageId" TEXT,
  "approvedByUserId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processingStartedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "leaseOwner" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorRedacted" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeliveryAttempt" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "outboundMessageId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "outcome" "DeliveryAttemptOutcome" NOT NULL,
  "providerStatusCode" INTEGER,
  "providerErrorCode" TEXT,
  "retryable" BOOLEAN NOT NULL DEFAULT false,
  "responseMetadata" JSONB,
  "errorRedacted" TEXT,
  "correlationId" TEXT,

  CONSTRAINT "DeliveryAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChannelConnection_publicId_key" ON "ChannelConnection"("publicId");
CREATE UNIQUE INDEX "ChannelConnection_organizationId_provider_externalAccountId_key" ON "ChannelConnection"("organizationId", "provider", "externalAccountId");
CREATE INDEX "ChannelConnection_organizationId_idx" ON "ChannelConnection"("organizationId");
CREATE INDEX "ChannelConnection_provider_idx" ON "ChannelConnection"("provider");
CREATE INDEX "ChannelConnection_status_idx" ON "ChannelConnection"("status");
CREATE INDEX "ChannelConnection_createdAt_idx" ON "ChannelConnection"("createdAt");

CREATE UNIQUE INDEX "ExternalCustomer_organizationId_channelConnectionId_externalCustomerId_key" ON "ExternalCustomer"("organizationId", "channelConnectionId", "externalCustomerId");
CREATE UNIQUE INDEX "ExternalCustomer_organizationId_channelConnectionId_normalizedEmail_key" ON "ExternalCustomer"("organizationId", "channelConnectionId", "normalizedEmail");
CREATE INDEX "ExternalCustomer_organizationId_idx" ON "ExternalCustomer"("organizationId");
CREATE INDEX "ExternalCustomer_channelConnectionId_idx" ON "ExternalCustomer"("channelConnectionId");
CREATE INDEX "ExternalCustomer_normalizedEmail_idx" ON "ExternalCustomer"("normalizedEmail");

CREATE UNIQUE INDEX "Conversation_organizationId_channelConnectionId_externalThreadId_key" ON "Conversation"("organizationId", "channelConnectionId", "externalThreadId");
CREATE INDEX "Conversation_organizationId_idx" ON "Conversation"("organizationId");
CREATE INDEX "Conversation_channelConnectionId_idx" ON "Conversation"("channelConnectionId");
CREATE INDEX "Conversation_externalCustomerId_idx" ON "Conversation"("externalCustomerId");
CREATE INDEX "Conversation_ticketId_idx" ON "Conversation"("ticketId");
CREATE INDEX "Conversation_lastMessageAt_idx" ON "Conversation"("lastMessageAt");

CREATE UNIQUE INDEX "ExternalMessage_channelConnectionId_providerMessageId_key" ON "ExternalMessage"("channelConnectionId", "providerMessageId");
CREATE UNIQUE INDEX "ExternalMessage_channelConnectionId_providerEventId_key" ON "ExternalMessage"("channelConnectionId", "providerEventId");
CREATE INDEX "ExternalMessage_organizationId_idx" ON "ExternalMessage"("organizationId");
CREATE INDEX "ExternalMessage_conversationId_idx" ON "ExternalMessage"("conversationId");
CREATE INDEX "ExternalMessage_channelConnectionId_idx" ON "ExternalMessage"("channelConnectionId");
CREATE INDEX "ExternalMessage_providerMessageId_idx" ON "ExternalMessage"("providerMessageId");
CREATE INDEX "ExternalMessage_providerEventId_idx" ON "ExternalMessage"("providerEventId");
CREATE INDEX "ExternalMessage_createdAt_idx" ON "ExternalMessage"("createdAt");

CREATE INDEX "MessageAttachment_organizationId_idx" ON "MessageAttachment"("organizationId");
CREATE INDEX "MessageAttachment_externalMessageId_idx" ON "MessageAttachment"("externalMessageId");
CREATE INDEX "MessageAttachment_providerAttachmentId_idx" ON "MessageAttachment"("providerAttachmentId");
CREATE INDEX "MessageAttachment_createdAt_idx" ON "MessageAttachment"("createdAt");

CREATE UNIQUE INDEX "WebhookReceipt_channelConnectionId_providerEventId_key" ON "WebhookReceipt"("channelConnectionId", "providerEventId");
CREATE INDEX "WebhookReceipt_organizationId_idx" ON "WebhookReceipt"("organizationId");
CREATE INDEX "WebhookReceipt_channelConnectionId_idx" ON "WebhookReceipt"("channelConnectionId");
CREATE INDEX "WebhookReceipt_providerEventId_idx" ON "WebhookReceipt"("providerEventId");
CREATE INDEX "WebhookReceipt_status_idx" ON "WebhookReceipt"("status");
CREATE INDEX "WebhookReceipt_receivedAt_idx" ON "WebhookReceipt"("receivedAt");

CREATE UNIQUE INDEX "OutboundMessage_idempotencyKey_key" ON "OutboundMessage"("idempotencyKey");
CREATE UNIQUE INDEX "OutboundMessage_channelConnectionId_providerMessageId_key" ON "OutboundMessage"("channelConnectionId", "providerMessageId");
CREATE INDEX "OutboundMessage_organizationId_idx" ON "OutboundMessage"("organizationId");
CREATE INDEX "OutboundMessage_conversationId_idx" ON "OutboundMessage"("conversationId");
CREATE INDEX "OutboundMessage_channelConnectionId_idx" ON "OutboundMessage"("channelConnectionId");
CREATE INDEX "OutboundMessage_ticketId_idx" ON "OutboundMessage"("ticketId");
CREATE INDEX "OutboundMessage_draftId_idx" ON "OutboundMessage"("draftId");
CREATE INDEX "OutboundMessage_status_nextAttemptAt_idx" ON "OutboundMessage"("status", "nextAttemptAt");
CREATE INDEX "OutboundMessage_createdAt_idx" ON "OutboundMessage"("createdAt");

CREATE UNIQUE INDEX "DeliveryAttempt_outboundMessageId_attemptNumber_key" ON "DeliveryAttempt"("outboundMessageId", "attemptNumber");
CREATE INDEX "DeliveryAttempt_organizationId_idx" ON "DeliveryAttempt"("organizationId");
CREATE INDEX "DeliveryAttempt_outboundMessageId_idx" ON "DeliveryAttempt"("outboundMessageId");
CREATE INDEX "DeliveryAttempt_startedAt_idx" ON "DeliveryAttempt"("startedAt");

ALTER TABLE "ChannelConnection"
  ADD CONSTRAINT "ChannelConnection_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExternalCustomer"
  ADD CONSTRAINT "ExternalCustomer_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExternalCustomer"
  ADD CONSTRAINT "ExternalCustomer_channelConnectionId_fkey"
  FOREIGN KEY ("channelConnectionId") REFERENCES "ChannelConnection"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_channelConnectionId_fkey"
  FOREIGN KEY ("channelConnectionId") REFERENCES "ChannelConnection"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_externalCustomerId_fkey"
  FOREIGN KEY ("externalCustomerId") REFERENCES "ExternalCustomer"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ExternalMessage"
  ADD CONSTRAINT "ExternalMessage_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExternalMessage"
  ADD CONSTRAINT "ExternalMessage_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExternalMessage"
  ADD CONSTRAINT "ExternalMessage_channelConnectionId_fkey"
  FOREIGN KEY ("channelConnectionId") REFERENCES "ChannelConnection"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageAttachment"
  ADD CONSTRAINT "MessageAttachment_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageAttachment"
  ADD CONSTRAINT "MessageAttachment_externalMessageId_fkey"
  FOREIGN KEY ("externalMessageId") REFERENCES "ExternalMessage"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WebhookReceipt"
  ADD CONSTRAINT "WebhookReceipt_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WebhookReceipt"
  ADD CONSTRAINT "WebhookReceipt_channelConnectionId_fkey"
  FOREIGN KEY ("channelConnectionId") REFERENCES "ChannelConnection"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OutboundMessage"
  ADD CONSTRAINT "OutboundMessage_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OutboundMessage"
  ADD CONSTRAINT "OutboundMessage_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OutboundMessage"
  ADD CONSTRAINT "OutboundMessage_channelConnectionId_fkey"
  FOREIGN KEY ("channelConnectionId") REFERENCES "ChannelConnection"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OutboundMessage"
  ADD CONSTRAINT "OutboundMessage_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OutboundMessage"
  ADD CONSTRAINT "OutboundMessage_draftId_fkey"
  FOREIGN KEY ("draftId") REFERENCES "OutboundDraft"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OutboundMessage"
  ADD CONSTRAINT "OutboundMessage_externalMessageId_fkey"
  FOREIGN KEY ("externalMessageId") REFERENCES "ExternalMessage"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OutboundMessage"
  ADD CONSTRAINT "OutboundMessage_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DeliveryAttempt"
  ADD CONSTRAINT "DeliveryAttempt_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeliveryAttempt"
  ADD CONSTRAINT "DeliveryAttempt_outboundMessageId_fkey"
  FOREIGN KEY ("outboundMessageId") REFERENCES "OutboundMessage"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
