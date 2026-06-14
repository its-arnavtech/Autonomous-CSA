-- CreateEnum
CREATE TYPE "AgentStepType" AS ENUM ('ROUTER', 'RESOLVER', 'CRITIC');

-- CreateEnum
CREATE TYPE "AgentStepStatus" AS ENUM ('STARTED', 'SUCCEEDED', 'FAILED', 'BLOCKED');

-- AlterEnum
ALTER TYPE "AgentRunStatus" RENAME TO "AgentRunStatus_old";
CREATE TYPE "AgentRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'BLOCKED', 'CANCELLED');
ALTER TABLE "AgentRun"
  ALTER COLUMN "status" TYPE "AgentRunStatus"
  USING ("status"::text::"AgentRunStatus");
DROP TYPE "AgentRunStatus_old";

-- AlterEnum
ALTER TYPE "AgentEventType" ADD VALUE IF NOT EXISTS 'ROUTER_STARTED';
ALTER TYPE "AgentEventType" ADD VALUE IF NOT EXISTS 'RESOLVER_STARTED';
ALTER TYPE "AgentEventType" ADD VALUE IF NOT EXISTS 'RESOLVER_DRAFTED';
ALTER TYPE "AgentEventType" ADD VALUE IF NOT EXISTS 'CRITIC_STARTED';
ALTER TYPE "AgentEventType" ADD VALUE IF NOT EXISTS 'CRITIC_REVIEWED';
ALTER TYPE "AgentEventType" ADD VALUE IF NOT EXISTS 'CRITIC_BLOCKED';
ALTER TYPE "AgentEventType" ADD VALUE IF NOT EXISTS 'AGENT_STEP_FAILED';

-- CreateTable
CREATE TABLE "AgentStep" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "stepType" "AgentStepType" NOT NULL,
    "status" "AgentStepStatus" NOT NULL,
    "inputJson" JSONB,
    "outputJson" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentStep_orgId_agentRunId_stepType_idx" ON "AgentStep"("orgId", "agentRunId", "stepType");

-- CreateIndex
CREATE INDEX "AgentStep_orgId_createdAt_idx" ON "AgentStep"("orgId", "createdAt");

-- AddForeignKey
ALTER TABLE "AgentStep" ADD CONSTRAINT "AgentStep_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
