-- Phase 9: Observability, operations, and queue failure handling

ALTER TABLE "AgentRun"
  ADD COLUMN "correlationId" TEXT,
  ADD COLUMN "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "durationMs" INTEGER,
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastErrorCode" TEXT,
  ADD COLUMN "lastErrorMessage" TEXT,
  ADD COLUMN "failureStage" TEXT;

ALTER TABLE "AgentStep"
  ADD COLUMN "durationMs" INTEGER,
  ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "errorCode" TEXT;

ALTER TABLE "AgentEvent"
  ADD COLUMN "correlationId" TEXT;

CREATE TABLE "OperationalFailure" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "queueName" TEXT NOT NULL,
  "jobName" TEXT NOT NULL,
  "jobId" TEXT,
  "correlationId" TEXT,
  "ticketId" TEXT,
  "runId" TEXT,
  "errorCode" TEXT NOT NULL,
  "safeErrorMessage" TEXT NOT NULL,
  "attemptCount" INTEGER NOT NULL,
  "payloadSummaryJson" JSONB,
  "failedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolvedByUserId" TEXT,
  "resolutionNote" TEXT,
  "replayedJobId" TEXT,

  CONSTRAINT "OperationalFailure_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentRun_correlationId_idx" ON "AgentRun"("correlationId");
CREATE INDEX "AgentRun_orgId_status_createdAt_idx" ON "AgentRun"("orgId", "status", "createdAt");
CREATE INDEX "AgentEvent_correlationId_idx" ON "AgentEvent"("correlationId");
CREATE INDEX "OperationalFailure_organizationId_failedAt_idx" ON "OperationalFailure"("organizationId", "failedAt");
CREATE INDEX "OperationalFailure_correlationId_idx" ON "OperationalFailure"("correlationId");
CREATE INDEX "OperationalFailure_runId_idx" ON "OperationalFailure"("runId");
CREATE INDEX "OperationalFailure_ticketId_idx" ON "OperationalFailure"("ticketId");

ALTER TABLE "OperationalFailure"
  ADD CONSTRAINT "OperationalFailure_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OperationalFailure"
  ADD CONSTRAINT "OperationalFailure_resolvedByUserId_fkey"
  FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
