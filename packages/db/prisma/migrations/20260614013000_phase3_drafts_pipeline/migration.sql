-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('RECEIVED', 'DRAFTED', 'SENT');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SENT');

-- AlterEnum
ALTER TYPE "AgentEventType" ADD VALUE IF NOT EXISTS 'DRAFT_CREATED';
ALTER TYPE "AgentEventType" ADD VALUE IF NOT EXISTS 'DRAFT_EDITED';
ALTER TYPE "AgentEventType" ADD VALUE IF NOT EXISTS 'DRAFT_APPROVED';
ALTER TYPE "AgentEventType" ADD VALUE IF NOT EXISTS 'DRAFT_REJECTED';
ALTER TYPE "AgentEventType" ADD VALUE IF NOT EXISTS 'DRAFT_AUTO_APPROVED';
ALTER TYPE "AgentEventType" ADD VALUE IF NOT EXISTS 'DRAFT_SENT';
ALTER TYPE "AgentEventType" ADD VALUE IF NOT EXISTS 'OUTBOUND_MESSAGE_CREATED';

-- AlterTable
ALTER TABLE "TicketMessage"
ADD COLUMN "status" "MessageStatus" NOT NULL DEFAULT 'RECEIVED';

-- CreateTable
CREATE TABLE "OutboundDraft" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "agentRunId" TEXT,
    "body" TEXT NOT NULL,
    "status" "DraftStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT 'agent_stub',
    "approvedBy" TEXT,
    "rejectedReason" TEXT,

    CONSTRAINT "OutboundDraft_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "HumanApproval"
ADD COLUMN "outboundDraftId" TEXT;

-- CreateIndex
CREATE INDEX "TicketMessage_orgId_ticketId_createdAt_idx" ON "TicketMessage"("orgId", "ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "HumanApproval_orgId_outboundDraftId_idx" ON "HumanApproval"("orgId", "outboundDraftId");

-- CreateIndex
CREATE INDEX "OutboundDraft_orgId_ticketId_createdAt_idx" ON "OutboundDraft"("orgId", "ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "OutboundDraft_agentRunId_idx" ON "OutboundDraft"("agentRunId");

-- AddForeignKey
ALTER TABLE "HumanApproval" ADD CONSTRAINT "HumanApproval_outboundDraftId_fkey" FOREIGN KEY ("outboundDraftId") REFERENCES "OutboundDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundDraft" ADD CONSTRAINT "OutboundDraft_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundDraft" ADD CONSTRAINT "OutboundDraft_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundDraft" ADD CONSTRAINT "OutboundDraft_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
