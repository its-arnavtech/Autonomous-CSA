-- Phase 6: Agent Guardrails, Cost Controls, and Safety Policy Enforcement

-- Extend AgentEventType with guardrail event values
ALTER TYPE "AgentEventType" ADD VALUE IF NOT EXISTS 'GUARDRAIL_STARTED';
ALTER TYPE "AgentEventType" ADD VALUE IF NOT EXISTS 'GUARDRAIL_CHECK_PASSED';
ALTER TYPE "AgentEventType" ADD VALUE IF NOT EXISTS 'GUARDRAIL_REQUIRES_APPROVAL';
ALTER TYPE "AgentEventType" ADD VALUE IF NOT EXISTS 'GUARDRAIL_BLOCKED';
ALTER TYPE "AgentEventType" ADD VALUE IF NOT EXISTS 'GUARDRAIL_PII_DETECTED';
ALTER TYPE "AgentEventType" ADD VALUE IF NOT EXISTS 'GUARDRAIL_SECRET_DETECTED';
ALTER TYPE "AgentEventType" ADD VALUE IF NOT EXISTS 'GUARDRAIL_COST_LIMIT_EXCEEDED';
ALTER TYPE "AgentEventType" ADD VALUE IF NOT EXISTS 'GUARDRAIL_KNOWLEDGE_GROUNDING_FAILED';

-- Create GuardrailDecision enum
CREATE TYPE "GuardrailDecision" AS ENUM ('ALLOW', 'REQUIRE_APPROVAL', 'BLOCK');

-- Create GuardrailType enum
CREATE TYPE "GuardrailType" AS ENUM (
  'COST_LIMIT',
  'SAFETY_POLICY',
  'KNOWLEDGE_GROUNDING',
  'PII_DETECTION',
  'SECRET_DETECTION',
  'AUTO_SEND_POLICY'
);

-- Extend OrganizationSettings with guardrail policy fields
ALTER TABLE "OrganizationSettings"
  ADD COLUMN "maxAutoSendCostCents"            INTEGER NOT NULL DEFAULT 25,
  ADD COLUMN "requireApprovalForLowConfidence" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "blockOnPiiDetection"             BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "minCriticCompletenessScore"      INTEGER NOT NULL DEFAULT 70;

-- Create AgentGuardrailCheck table
CREATE TABLE "AgentGuardrailCheck" (
  "id"            TEXT               NOT NULL,
  "orgId"         TEXT               NOT NULL,
  "ticketId"      TEXT               NOT NULL,
  "agentRunId"    TEXT,
  "guardrailType" "GuardrailType"    NOT NULL,
  "decision"      "GuardrailDecision" NOT NULL,
  "reason"        TEXT,
  "metadata"      JSONB,
  "createdAt"     TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentGuardrailCheck_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "AgentGuardrailCheck_orgId_ticketId_createdAt_idx"
  ON "AgentGuardrailCheck"("orgId", "ticketId", "createdAt");

CREATE INDEX "AgentGuardrailCheck_agentRunId_idx"
  ON "AgentGuardrailCheck"("agentRunId");

-- Foreign key: AgentGuardrailCheck → AgentRun (nullable, SET NULL on delete)
ALTER TABLE "AgentGuardrailCheck"
  ADD CONSTRAINT "AgentGuardrailCheck_agentRunId_fkey"
  FOREIGN KEY ("agentRunId")
  REFERENCES "AgentRun"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
