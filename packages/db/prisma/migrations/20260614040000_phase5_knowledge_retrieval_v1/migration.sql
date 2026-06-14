-- CreateEnum
CREATE TYPE "KnowledgeArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterEnum
ALTER TYPE "AgentStepType" RENAME TO "AgentStepType_old";
CREATE TYPE "AgentStepType" AS ENUM ('ROUTER', 'RETRIEVER', 'RESOLVER', 'CRITIC');
ALTER TABLE "AgentStep"
  ALTER COLUMN "stepType" TYPE "AgentStepType"
  USING ("stepType"::text::"AgentStepType");
DROP TYPE "AgentStepType_old";

-- AlterEnum
ALTER TYPE "AgentEventType" ADD VALUE IF NOT EXISTS 'RETRIEVER_STARTED';
ALTER TYPE "AgentEventType" ADD VALUE IF NOT EXISTS 'RETRIEVER_RESULTS';
ALTER TYPE "AgentEventType" ADD VALUE IF NOT EXISTS 'KNOWLEDGE_USED';
ALTER TYPE "AgentEventType" ADD VALUE IF NOT EXISTS 'KNOWLEDGE_NOT_FOUND';

-- CreateTable
CREATE TABLE "KnowledgeArticle" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "KnowledgeArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeRetrieval" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "agentRunId" TEXT,
    "query" TEXT NOT NULL,
    "resultCount" INTEGER NOT NULL,
    "resultsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeRetrieval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeArticle_orgId_status_updatedAt_idx" ON "KnowledgeArticle"("orgId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "KnowledgeArticle_orgId_createdAt_idx" ON "KnowledgeArticle"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeRetrieval_orgId_ticketId_createdAt_idx" ON "KnowledgeRetrieval"("orgId", "ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeRetrieval_orgId_agentRunId_idx" ON "KnowledgeRetrieval"("orgId", "agentRunId");

-- AddForeignKey
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeRetrieval" ADD CONSTRAINT "KnowledgeRetrieval_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeRetrieval" ADD CONSTRAINT "KnowledgeRetrieval_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeRetrieval" ADD CONSTRAINT "KnowledgeRetrieval_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
