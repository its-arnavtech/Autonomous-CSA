-- Phase 12 follow-up: organization-level channel audit events.
-- This avoids storing connection administration events in ticket-specific AgentEvent rows.

CREATE TABLE "ChannelAuditEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "correlationId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ChannelAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChannelAuditEvent_organizationId_createdAt_idx" ON "ChannelAuditEvent"("organizationId", "createdAt");
CREATE INDEX "ChannelAuditEvent_actorUserId_idx" ON "ChannelAuditEvent"("actorUserId");
CREATE INDEX "ChannelAuditEvent_targetType_targetId_idx" ON "ChannelAuditEvent"("targetType", "targetId");
CREATE INDEX "ChannelAuditEvent_correlationId_idx" ON "ChannelAuditEvent"("correlationId");
CREATE INDEX "ChannelAuditEvent_action_idx" ON "ChannelAuditEvent"("action");

ALTER TABLE "ChannelAuditEvent"
  ADD CONSTRAINT "ChannelAuditEvent_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChannelAuditEvent"
  ADD CONSTRAINT "ChannelAuditEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
