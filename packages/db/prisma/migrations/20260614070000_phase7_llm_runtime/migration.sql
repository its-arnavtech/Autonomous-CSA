-- Phase 7: LLM Runtime — AgentStep usage columns + AgentEventType LLM values

ALTER TABLE "AgentStep"
  ADD COLUMN "provider"           TEXT,
  ADD COLUMN "model"              TEXT,
  ADD COLUMN "inputTokens"        INTEGER,
  ADD COLUMN "outputTokens"       INTEGER,
  ADD COLUMN "estimatedCostCents" INTEGER;

ALTER TYPE "AgentEventType" ADD VALUE IF NOT EXISTS 'LLM_CALL_STARTED';
ALTER TYPE "AgentEventType" ADD VALUE IF NOT EXISTS 'LLM_CALL_SUCCEEDED';
ALTER TYPE "AgentEventType" ADD VALUE IF NOT EXISTS 'LLM_CALL_FAILED';
ALTER TYPE "AgentEventType" ADD VALUE IF NOT EXISTS 'LLM_FALLBACK_USED';
ALTER TYPE "AgentEventType" ADD VALUE IF NOT EXISTS 'LLM_USAGE_RECORDED';
