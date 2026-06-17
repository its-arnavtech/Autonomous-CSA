-- Phase 12 follow-up: durable DB-backed dispatch for inbound support runs.
-- This is additive and preserves all Phase 12 foundation data.

CREATE TYPE "InboundDispatchStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "InboundDispatch" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "webhookReceiptId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "status" "InboundDispatchStatus" NOT NULL DEFAULT 'PENDING',
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lockOwner" TEXT,
  "lockExpiresAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorRedacted" TEXT,
  "jobId" TEXT,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InboundDispatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InboundDispatch_idempotencyKey_key" ON "InboundDispatch"("idempotencyKey");
CREATE INDEX "InboundDispatch_organizationId_idx" ON "InboundDispatch"("organizationId");
CREATE INDEX "InboundDispatch_ticketId_idx" ON "InboundDispatch"("ticketId");
CREATE INDEX "InboundDispatch_runId_idx" ON "InboundDispatch"("runId");
CREATE INDEX "InboundDispatch_webhookReceiptId_idx" ON "InboundDispatch"("webhookReceiptId");
CREATE INDEX "InboundDispatch_status_availableAt_idx" ON "InboundDispatch"("status", "availableAt");
CREATE INDEX "InboundDispatch_lockExpiresAt_idx" ON "InboundDispatch"("lockExpiresAt");
CREATE INDEX "InboundDispatch_createdAt_idx" ON "InboundDispatch"("createdAt");

ALTER TABLE "InboundDispatch"
  ADD CONSTRAINT "InboundDispatch_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InboundDispatch"
  ADD CONSTRAINT "InboundDispatch_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InboundDispatch"
  ADD CONSTRAINT "InboundDispatch_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "AgentRun"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InboundDispatch"
  ADD CONSTRAINT "InboundDispatch_webhookReceiptId_fkey"
  FOREIGN KEY ("webhookReceiptId") REFERENCES "WebhookReceipt"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
