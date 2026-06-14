-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "TicketStatus" RENAME TO "TicketStatus_old";
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'PENDING', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED');
ALTER TABLE "Ticket"
  ALTER COLUMN "status" TYPE "TicketStatus"
  USING (
    CASE
      WHEN "status"::text = 'ESCALATED' THEN 'PENDING'
      ELSE "status"::text
    END
  )::"TicketStatus";
DROP TYPE "TicketStatus_old";

-- AlterEnum
ALTER TYPE "TicketPriority" RENAME TO "TicketPriority_old";
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
ALTER TABLE "Ticket"
  ALTER COLUMN "priority" TYPE "TicketPriority"
  USING (
    CASE
      WHEN "priority"::text = 'MEDIUM' THEN 'NORMAL'
      ELSE "priority"::text
    END
  )::"TicketPriority";
DROP TYPE "TicketPriority_old";

-- CreateTable
CREATE TABLE "OrganizationSettings" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "autoRespond" BOOLEAN NOT NULL DEFAULT false,
    "requireHumanApproval" BOOLEAN NOT NULL DEFAULT true,
    "maxAgentCostCents" INTEGER NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HumanApproval" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "agentRunId" TEXT,
    "status" "ApprovalStatus" NOT NULL,
    "proposedResponse" TEXT,
    "reviewerNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HumanApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationSettings_orgId_key" ON "OrganizationSettings"("orgId");

-- CreateIndex
CREATE INDEX "Ticket_orgId_updatedAt_idx" ON "Ticket"("orgId", "updatedAt");

-- CreateIndex
CREATE INDEX "HumanApproval_orgId_ticketId_createdAt_idx" ON "HumanApproval"("orgId", "ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "HumanApproval_agentRunId_idx" ON "HumanApproval"("agentRunId");

-- AddForeignKey
ALTER TABLE "OrganizationSettings" ADD CONSTRAINT "OrganizationSettings_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanApproval" ADD CONSTRAINT "HumanApproval_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanApproval" ADD CONSTRAINT "HumanApproval_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanApproval" ADD CONSTRAINT "HumanApproval_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
