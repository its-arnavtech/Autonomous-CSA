import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  AgentEventType,
  AgentRunStatus,
  ApprovalStatus,
  DraftStatus,
  GuardrailDecision,
  Prisma,
  nextEventSequence,
} from '@agentic-support/db';
import { AgentRuntimeService } from './agent-runtime/agent-runtime.service';
import { GuardrailService } from './guardrails/guardrail.service';
import { estimateCostCents } from './guardrails/cost-estimator';
import { PrismaService } from './prisma.service';

type TicketProcessJob = {
  orgId: string;
  orgSlug?: string;
  runId: string;
  ticketId: string;
  subject: string;
  body: string;
  customerEmail: string;
};

@Processor('support')
export class SupportProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentRuntimeService: AgentRuntimeService,
    private readonly guardrailService: GuardrailService,
  ) {
    super();
  }

  async process(job: Job) {
    if (job.name === 'ticket.process') {
      const { orgId, orgSlug, runId, ticketId, subject } =
        job.data as TicketProcessJob;

      try {
        await this.prisma.agentRun.update({
          where: { id: runId },
          data: {
            status: AgentRunStatus.RUNNING,
            startedAt: new Date(),
          },
        });

        await this.appendAgentEvent({
          orgId,
          ticketId,
          runId,
          type: AgentEventType.RUN_STARTED,
          payload: { jobId: job.id, subject },
        });

        console.log(
          `[worker] processing ticket ${ticketId} for org ${orgSlug ?? orgId}`,
        );

        const pipeline = await this.agentRuntimeService.runPipeline({
          orgId,
          ticketId,
          runId,
          subject,
          body: (job.data as TicketProcessJob).body,
        });

        const settings = await this.prisma.organizationSettings.upsert({
          where: { orgId },
          update: {},
          create: { orgId },
        });

        const draftBody = pipeline.resolver.draftBody;
        // Use actual LLM cost when available; fall back to text-length estimate
        const pipelineCost = pipeline.estimatedCostCents ?? 0;
        const estimatedCostCents =
          pipelineCost > 0
            ? pipelineCost
            : estimateCostCents({ subject, draftBody });

        await this.appendAgentEvent({
          orgId,
          ticketId,
          runId,
          type: AgentEventType.GUARDRAIL_STARTED,
          payload: { estimatedCostCents },
        });

        const { checks, aggregate } = await this.guardrailService.runAll({
          orgId,
          ticketId,
          agentRunId: runId,
          draftBody,
          resolverConfidence: pipeline.resolver.confidence,
          usedKnowledgeArticleIds:
            pipeline.resolver.usedKnowledgeArticleIds ?? [],
          criticPassed: pipeline.critic.passed,
          criticSafetyVerdict: pipeline.critic.safetyVerdict,
          criticCompletenessScore: pipeline.critic.completenessScore,
          estimatedCostCents,
          settings: {
            maxAutoSendCostCents: settings.maxAutoSendCostCents,
            requireApprovalForLowConfidence:
              settings.requireApprovalForLowConfidence,
            blockOnPiiDetection: settings.blockOnPiiDetection,
            minCriticCompletenessScore: settings.minCriticCompletenessScore,
          },
        });

        // Emit specific detection events
        for (const check of checks) {
          if (
            check.guardrailType === 'PII_DETECTION' &&
            check.decision !== GuardrailDecision.ALLOW
          ) {
            await this.appendAgentEvent({
              orgId,
              ticketId,
              runId,
              type: AgentEventType.GUARDRAIL_PII_DETECTED,
              payload: {
                reason: check.reason,
                metadata: (check.metadata ?? null) as Prisma.InputJsonValue,
              },
            });
          } else if (
            check.guardrailType === 'SECRET_DETECTION' &&
            check.decision !== GuardrailDecision.ALLOW
          ) {
            await this.appendAgentEvent({
              orgId,
              ticketId,
              runId,
              type: AgentEventType.GUARDRAIL_SECRET_DETECTED,
              payload: {
                reason: check.reason,
                metadata: (check.metadata ?? null) as Prisma.InputJsonValue,
              },
            });
          } else if (
            check.guardrailType === 'COST_LIMIT' &&
            check.decision !== GuardrailDecision.ALLOW
          ) {
            await this.appendAgentEvent({
              orgId,
              ticketId,
              runId,
              type: AgentEventType.GUARDRAIL_COST_LIMIT_EXCEEDED,
              payload: {
                reason: check.reason,
                metadata: (check.metadata ?? null) as Prisma.InputJsonValue,
              },
            });
          } else if (
            check.guardrailType === 'KNOWLEDGE_GROUNDING' &&
            check.decision !== GuardrailDecision.ALLOW
          ) {
            await this.appendAgentEvent({
              orgId,
              ticketId,
              runId,
              type: AgentEventType.GUARDRAIL_KNOWLEDGE_GROUNDING_FAILED,
              payload: { reason: check.reason },
            });
          }
        }

        // Create draft with status determined by guardrail aggregate
        const draftStatus =
          aggregate === GuardrailDecision.BLOCK
            ? DraftStatus.DRAFT
            : aggregate === GuardrailDecision.REQUIRE_APPROVAL
              ? DraftStatus.PENDING_APPROVAL
              : settings.requireHumanApproval
                ? DraftStatus.PENDING_APPROVAL
                : DraftStatus.APPROVED;

        const draft = await this.prisma.outboundDraft.create({
          data: {
            orgId,
            ticketId,
            agentRunId: runId,
            body: draftBody,
            status: draftStatus,
            createdBy: 'agent_stub',
            approvedBy:
              draftStatus === DraftStatus.APPROVED ? 'agent_stub' : null,
          },
        });

        await this.appendAgentEvent({
          orgId,
          ticketId,
          runId,
          type: AgentEventType.DRAFT_CREATED,
          payload: { draftId: draft.id, status: draft.status },
        });

        // Branch on aggregate guardrail decision
        if (aggregate === GuardrailDecision.BLOCK) {
          await this.appendAgentEvent({
            orgId,
            ticketId,
            runId,
            type: AgentEventType.GUARDRAIL_BLOCKED,
            payload: {
              draftId: draft.id,
              checks: checks.map((c) => ({
                type: c.guardrailType,
                decision: c.decision,
                reason: c.reason,
              })),
            },
          });
        } else if (
          aggregate === GuardrailDecision.REQUIRE_APPROVAL ||
          settings.requireHumanApproval
        ) {
          // Guardrail requires approval, OR org policy requires human approval
          const approvalEventType =
            aggregate === GuardrailDecision.REQUIRE_APPROVAL
              ? AgentEventType.GUARDRAIL_REQUIRES_APPROVAL
              : AgentEventType.HUMAN_APPROVAL_CREATED;

          await this.prisma.humanApproval.create({
            data: {
              orgId,
              ticketId,
              agentRunId: runId,
              outboundDraftId: draft.id,
              status: ApprovalStatus.PENDING,
              proposedResponse: draftBody,
            },
          });

          await this.appendAgentEvent({
            orgId,
            ticketId,
            runId,
            type: approvalEventType,
            payload: {
              draftId: draft.id,
              status: ApprovalStatus.PENDING,
              proposedResponse: draftBody,
            },
          });
        } else {
          await this.appendAgentEvent({
            orgId,
            ticketId,
            runId,
            type: AgentEventType.GUARDRAIL_CHECK_PASSED,
            payload: {
              draftId: draft.id,
              checksCount: checks.length,
            },
          });
          await this.appendAgentEvent({
            orgId,
            ticketId,
            runId,
            type: AgentEventType.DRAFT_AUTO_APPROVED,
            payload: { draftId: draft.id, status: DraftStatus.APPROVED },
          });
        }

        await this.appendAgentEvent({
          orgId,
          ticketId,
          runId,
          type: AgentEventType.RUN_FINISHED,
          payload: {
            status:
              aggregate === GuardrailDecision.BLOCK ? 'BLOCKED' : 'SUCCEEDED',
          },
        });

        await this.prisma.agentRun.update({
          where: { id: runId },
          data: {
            status:
              aggregate === GuardrailDecision.BLOCK
                ? AgentRunStatus.BLOCKED
                : AgentRunStatus.SUCCEEDED,
            finishedAt: new Date(),
          },
        });

        return { ok: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[worker] ticket processing failed', {
          ticketId,
          runId,
          error,
        });

        await this.appendAgentEvent({
          orgId,
          ticketId,
          runId,
          type: AgentEventType.RUN_FAILED,
          payload: { message },
        });

        await this.prisma.agentRun.update({
          where: { id: runId },
          data: {
            status: AgentRunStatus.FAILED,
            errorMessage: message,
            finishedAt: new Date(),
          },
        });

        throw error;
      }
    }

    if (job.name === 'hello') {
      console.log(`[worker] got job ${job.id}:`, job.data);
      return { ok: true };
    }

    return { ok: true, ignored: true };
  }

  private async appendAgentEvent(params: {
    orgId: string;
    ticketId: string;
    runId: string;
    type: AgentEventType;
    payload: Prisma.InputJsonValue;
  }) {
    await this.prisma.$transaction(async (tx) => {
      const sequence = await nextEventSequence(
        tx,
        params.orgId,
        params.ticketId,
      );

      await tx.agentEvent.create({
        data: {
          orgId: params.orgId,
          ticketId: params.ticketId,
          runId: params.runId,
          sequence,
          type: params.type,
          payload: params.payload,
        },
      });
    });
  }
}
