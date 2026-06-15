import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue, UnrecoverableError } from 'bullmq';
import {
  AgentEventType,
  AgentRunStatus,
  ApprovalStatus,
  DraftStatus,
  GuardrailDecision,
  GuardrailType,
  Prisma,
  nextEventSequence,
} from '@agentic-support/db';
import {
  getCorrelationContext,
  sanitizeForLog,
  runWithCorrelationContext,
  startTimer,
} from '@agentic-support/observability';
import { AgentRuntimeService } from './agent-runtime/agent-runtime.service';
import { GuardrailService } from './guardrails/guardrail.service';
import { estimateCostCents } from './guardrails/cost-estimator';
import { MetricsService } from './observability/metrics.service';
import { classifyRetryableError } from './queue/retry-classifier';
import {
  SUPPORT_DEAD_LETTER_QUEUE_NAME,
  SUPPORT_QUEUE_NAME,
} from './queue/queue.config';
import { PrismaService } from './prisma.service';
import { workerLogger } from './observability/worker-logger';

type TicketProcessJob = {
  orgId: string;
  orgSlug?: string;
  runId: string;
  ticketId: string;
  subject: string;
  body: string;
  customerEmail: string;
  requestedByUserId?: string;
  correlationId?: string | null;
  triggerType?: string;
  enqueuedAt?: string;
};

const AGENT_ACTOR = 'AGENT' as const;
const TERMINAL_RUN_STATUSES = new Set<AgentRunStatus>([
  AgentRunStatus.SUCCEEDED,
  AgentRunStatus.BLOCKED,
]);

@Processor(SUPPORT_QUEUE_NAME)
export class SupportProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentRuntimeService: AgentRuntimeService,
    private readonly guardrailService: GuardrailService,
    private readonly metrics: MetricsService = {
      incrementQueueStarted: () => undefined,
      incrementQueueCompleted: () => undefined,
      incrementQueueFailed: () => undefined,
      incrementQueueRetried: () => undefined,
      observeQueueDuration: () => undefined,
      incrementDeadLetter: () => undefined,
      incrementAgentRun: () => undefined,
      observeAgentRunDuration: () => undefined,
      incrementGuardrailOutcome: () => undefined,
      incrementApprovalRequired: () => undefined,
      incrementDraftCreated: () => undefined,
    } as unknown as MetricsService,
    @InjectQueue(SUPPORT_DEAD_LETTER_QUEUE_NAME)
    private readonly deadLetterQueue: Queue = {
      add: () => Promise.resolve({ id: 'noop' } as never),
    } as unknown as Queue,
  ) {
    super();
  }

  async process(job: Job) {
    if (job.name === 'ticket.process') {
      return this.processTicketJob(job as Job<TicketProcessJob>);
    }

    if (job.name === 'hello') {
      workerLogger.info('Received hello job', {
        jobId: String(job.id),
        payload: sanitizeForLog(job.data),
      });
      return { ok: true };
    }

    return { ok: true, ignored: true };
  }

  private async processTicketJob(job: Job<TicketProcessJob>) {
    const data = job.data;
    const correlationId =
      data.correlationId ?? `job-${String(job.id ?? data.runId)}`;
    const attemptNumber = job.attemptsMade + 1;

    return runWithCorrelationContext(
      {
        correlationId,
        requestId: correlationId,
        jobId: String(job.id),
        jobName: job.name,
        runId: data.runId,
        ticketId: data.ticketId,
        organizationId: data.orgId,
        retryAttempt: attemptNumber,
      },
      async () => {
        const timer = startTimer();
        const existingRun = await this.prisma.agentRun.findUnique({
          where: { id: data.runId },
          select: { status: true, trigger: true },
        });
        const trigger =
          data.triggerType ?? existingRun?.trigger ?? 'ticket_created';

        if (existingRun && TERMINAL_RUN_STATUSES.has(existingRun.status)) {
          workerLogger.info('Skipping duplicate terminal job execution', {
            jobId: String(job.id),
            runId: data.runId,
            ticketId: data.ticketId,
            status: existingRun.status,
          });
          return { ok: true, skipped: true };
        }

        try {
          this.metrics.incrementQueueStarted(job.name);
          this.metrics.incrementAgentRun(
            'running',
            String(trigger).toLowerCase(),
          );

          await this.prisma.agentRun.update({
            where: { id: data.runId },
            data: {
              status: AgentRunStatus.RUNNING,
              startedAt: new Date(),
              attemptCount: attemptNumber,
              correlationId,
              failureStage: null,
              lastErrorCode: null,
              lastErrorMessage: null,
            },
          });

          await this.appendAgentEventOnce({
            orgId: data.orgId,
            ticketId: data.ticketId,
            runId: data.runId,
            type: AgentEventType.RUN_STARTED,
            payload: {
              jobId: job.id,
              subject: data.subject,
              attemptNumber,
            },
          });

          workerLogger.info('Processing support job', {
            jobId: String(job.id),
            runId: data.runId,
            ticketId: data.ticketId,
            attemptNumber,
          });

          const pipeline = await this.agentRuntimeService.runPipeline({
            orgId: data.orgId,
            ticketId: data.ticketId,
            runId: data.runId,
            subject: data.subject,
            body: data.body,
          });

          const settings = await this.prisma.organizationSettings.upsert({
            where: { orgId: data.orgId },
            update: {},
            create: { orgId: data.orgId },
          });

          const draftBody = pipeline.resolver.draftBody;
          const pipelineCost = pipeline.estimatedCostCents ?? 0;
          const estimatedCostCents =
            pipelineCost > 0
              ? pipelineCost
              : estimateCostCents({ subject: data.subject, draftBody });

          await this.appendAgentEvent({
            orgId: data.orgId,
            ticketId: data.ticketId,
            runId: data.runId,
            type: AgentEventType.GUARDRAIL_STARTED,
            payload: { estimatedCostCents },
          });

          const { checks, aggregate } = await this.guardrailService.runAll({
            orgId: data.orgId,
            ticketId: data.ticketId,
            agentRunId: data.runId,
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

          for (const check of checks) {
            this.metrics.incrementGuardrailOutcome(
              String(check.guardrailType).toLowerCase(),
              String(check.decision).toLowerCase(),
            );
            if (
              check.guardrailType === GuardrailType.PII_DETECTION &&
              check.decision !== GuardrailDecision.ALLOW
            ) {
              await this.appendAgentEvent({
                orgId: data.orgId,
                ticketId: data.ticketId,
                runId: data.runId,
                type: AgentEventType.GUARDRAIL_PII_DETECTED,
                payload: {
                  reason: check.reason,
                  metadata: (check.metadata ?? null) as Prisma.InputJsonValue,
                },
              });
            } else if (
              check.guardrailType === GuardrailType.SECRET_DETECTION &&
              check.decision !== GuardrailDecision.ALLOW
            ) {
              await this.appendAgentEvent({
                orgId: data.orgId,
                ticketId: data.ticketId,
                runId: data.runId,
                type: AgentEventType.GUARDRAIL_SECRET_DETECTED,
                payload: {
                  reason: check.reason,
                  metadata: (check.metadata ?? null) as Prisma.InputJsonValue,
                },
              });
            } else if (
              check.guardrailType === GuardrailType.COST_LIMIT &&
              check.decision !== GuardrailDecision.ALLOW
            ) {
              await this.appendAgentEvent({
                orgId: data.orgId,
                ticketId: data.ticketId,
                runId: data.runId,
                type: AgentEventType.GUARDRAIL_COST_LIMIT_EXCEEDED,
                payload: {
                  reason: check.reason,
                  metadata: (check.metadata ?? null) as Prisma.InputJsonValue,
                },
              });
            } else if (
              check.guardrailType === GuardrailType.KNOWLEDGE_GROUNDING &&
              check.decision !== GuardrailDecision.ALLOW
            ) {
              await this.appendAgentEvent({
                orgId: data.orgId,
                ticketId: data.ticketId,
                runId: data.runId,
                type: AgentEventType.GUARDRAIL_KNOWLEDGE_GROUNDING_FAILED,
                payload: { reason: check.reason },
              });
            }
          }

          const draftStatus =
            aggregate === GuardrailDecision.BLOCK
              ? DraftStatus.DRAFT
              : aggregate === GuardrailDecision.REQUIRE_APPROVAL
                ? DraftStatus.PENDING_APPROVAL
                : settings.requireHumanApproval
                  ? DraftStatus.PENDING_APPROVAL
                  : DraftStatus.APPROVED;

          const draft = await this.ensureRunDraft({
            orgId: data.orgId,
            ticketId: data.ticketId,
            runId: data.runId,
            body: draftBody,
            status: draftStatus,
          });
          this.metrics.incrementDraftCreated('agent');

          await this.appendAgentEventOnce({
            orgId: data.orgId,
            ticketId: data.ticketId,
            runId: data.runId,
            type: AgentEventType.DRAFT_CREATED,
            payload: {
              draftId: draft.id,
              status: draft.status,
              actorType: AGENT_ACTOR,
            },
          });

          if (aggregate === GuardrailDecision.BLOCK) {
            await this.appendAgentEventOnce({
              orgId: data.orgId,
              ticketId: data.ticketId,
              runId: data.runId,
              type: AgentEventType.GUARDRAIL_BLOCKED,
              payload: {
                draftId: draft.id,
                checks: checks.map((check) => ({
                  type: check.guardrailType,
                  decision: check.decision,
                  reason: check.reason,
                })),
              },
            });
          } else if (
            aggregate === GuardrailDecision.REQUIRE_APPROVAL ||
            settings.requireHumanApproval
          ) {
            const approvalEventType =
              aggregate === GuardrailDecision.REQUIRE_APPROVAL
                ? AgentEventType.GUARDRAIL_REQUIRES_APPROVAL
                : AgentEventType.HUMAN_APPROVAL_CREATED;
            const approvalSource =
              aggregate === GuardrailDecision.REQUIRE_APPROVAL
                ? 'guardrail'
                : 'policy';

            await this.ensureApproval({
              orgId: data.orgId,
              ticketId: data.ticketId,
              runId: data.runId,
              draftId: draft.id,
              proposedResponse: draftBody,
            });
            this.metrics.incrementApprovalRequired(approvalSource);

            await this.appendAgentEventOnce({
              orgId: data.orgId,
              ticketId: data.ticketId,
              runId: data.runId,
              type: approvalEventType,
              payload: {
                draftId: draft.id,
                status: ApprovalStatus.PENDING,
              },
            });
          } else {
            await this.appendAgentEventOnce({
              orgId: data.orgId,
              ticketId: data.ticketId,
              runId: data.runId,
              type: AgentEventType.GUARDRAIL_CHECK_PASSED,
              payload: {
                draftId: draft.id,
                checksCount: checks.length,
              },
            });
            await this.appendAgentEventOnce({
              orgId: data.orgId,
              ticketId: data.ticketId,
              runId: data.runId,
              type: AgentEventType.DRAFT_AUTO_APPROVED,
              payload: {
                draftId: draft.id,
                status: DraftStatus.APPROVED,
                actorType: AGENT_ACTOR,
              },
            });
          }

          const finalStatus =
            aggregate === GuardrailDecision.BLOCK
              ? AgentRunStatus.BLOCKED
              : AgentRunStatus.SUCCEEDED;
          const durationMs = timer();

          await this.appendAgentEventOnce({
            orgId: data.orgId,
            ticketId: data.ticketId,
            runId: data.runId,
            type: AgentEventType.RUN_FINISHED,
            payload: {
              status: finalStatus,
            },
          });

          await this.prisma.agentRun.update({
            where: { id: data.runId },
            data: {
              status: finalStatus,
              finishedAt: new Date(),
              durationMs,
              totalCostCents: estimatedCostCents,
              attemptCount: attemptNumber,
            },
          });

          this.metrics.incrementQueueCompleted(job.name);
          this.metrics.observeQueueDuration(
            job.name,
            finalStatus === AgentRunStatus.BLOCKED ? 'blocked' : 'success',
            durationMs,
          );
          this.metrics.incrementAgentRun(
            finalStatus === AgentRunStatus.BLOCKED ? 'blocked' : 'success',
            String(trigger).toLowerCase(),
          );
          this.metrics.observeAgentRunDuration(
            finalStatus === AgentRunStatus.BLOCKED ? 'blocked' : 'success',
            durationMs,
          );

          return { ok: true, status: finalStatus };
        } catch (error) {
          const classification = classifyRetryableError(error);
          const durationMs = timer();
          const hasRemainingAttempts =
            attemptNumber < (job.opts?.attempts ?? attemptNumber);

          workerLogger.error('Support job failed', error, {
            jobId: String(job.id),
            runId: data.runId,
            ticketId: data.ticketId,
            attemptNumber,
            outcome: classification.metricOutcome,
            disposition: classification.disposition,
          });

          if (classification.disposition === 'BLOCKED') {
            await this.prisma.agentRun.update({
              where: { id: data.runId },
              data: {
                status: AgentRunStatus.BLOCKED,
                finishedAt: new Date(),
                durationMs,
                attemptCount: attemptNumber,
              },
            });
            this.metrics.observeQueueDuration(job.name, 'blocked', durationMs);
            this.metrics.incrementAgentRun(
              'blocked',
              String(trigger).toLowerCase(),
            );
            this.metrics.observeAgentRunDuration('blocked', durationMs);
            return { ok: true, status: AgentRunStatus.BLOCKED, blocked: true };
          }

          await this.appendAgentEventOnce({
            orgId: data.orgId,
            ticketId: data.ticketId,
            runId: data.runId,
            type: AgentEventType.RUN_FAILED,
            payload: {
              errorCode: classification.serialized.errorCode,
              message: classification.serialized.message,
              attemptNumber,
            },
          });

          await this.prisma.agentRun.update({
            where: { id: data.runId },
            data: {
              status: AgentRunStatus.FAILED,
              errorCode: classification.serialized.errorCode,
              errorMessage: classification.serialized.message,
              lastErrorCode: classification.serialized.errorCode,
              lastErrorMessage: classification.serialized.message,
              failureStage: 'support.processor',
              finishedAt: new Date(),
              durationMs,
              attemptCount: attemptNumber,
            },
          });

          this.metrics.incrementQueueFailed(
            job.name,
            classification.metricOutcome,
          );
          this.metrics.observeQueueDuration(
            job.name,
            classification.metricOutcome,
            durationMs,
          );
          this.metrics.incrementAgentRun(
            'failed',
            String(trigger).toLowerCase(),
          );
          this.metrics.observeAgentRunDuration('failed', durationMs);

          if (classification.retryable && hasRemainingAttempts) {
            this.metrics.incrementQueueRetried(
              job.name,
              classification.metricOutcome,
            );
            throw error;
          }

          if (classification.shouldDeadLetter) {
            const failureId = await this.recordOperationalFailure(
              job,
              classification.serialized.errorCode,
              classification.serialized.message,
              attemptNumber,
            );
            this.metrics.incrementDeadLetter(
              job.name,
              classification.metricOutcome,
            );

            await this.deadLetterQueue.add(
              'ticket.process.failed',
              {
                failureId,
                queueName: job.queueName,
                originalJobId: String(job.id),
                runId: data.runId,
                ticketId: data.ticketId,
                correlationId,
              },
              {
                jobId: `dead-letter-${String(job.id)}`,
                removeOnComplete: { count: 50 },
                removeOnFail: { count: 50 },
              },
            );
          }

          if (classification.useUnrecoverableError) {
            throw new UnrecoverableError(classification.serialized.message);
          }

          throw error;
        }
      },
    );
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
          correlationId: getCorrelationContext()?.correlationId ?? null,
          sequence,
          type: params.type,
          payload: params.payload,
        },
      });
    });
  }

  private async appendAgentEventOnce(params: {
    orgId: string;
    ticketId: string;
    runId: string;
    type: AgentEventType;
    payload: Prisma.InputJsonValue;
  }) {
    const existing = await this.prisma.agentEvent.findFirst({
      where: {
        orgId: params.orgId,
        ticketId: params.ticketId,
        runId: params.runId,
        type: params.type,
      },
      select: { id: true },
    });

    if (existing) {
      return;
    }

    await this.appendAgentEvent(params);
  }

  private async ensureRunDraft(params: {
    orgId: string;
    ticketId: string;
    runId: string;
    body: string;
    status: DraftStatus;
  }) {
    const existing = await this.prisma.outboundDraft.findFirst({
      where: {
        orgId: params.orgId,
        ticketId: params.ticketId,
        agentRunId: params.runId,
        createdByType: AGENT_ACTOR,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (existing) {
      return this.prisma.outboundDraft.update({
        where: { id: existing.id },
        data: {
          body: params.body,
          status: params.status,
          approvedBy: params.status === DraftStatus.APPROVED ? 'agent' : null,
          approvedByType:
            params.status === DraftStatus.APPROVED ? AGENT_ACTOR : null,
        },
      });
    }

    return this.prisma.outboundDraft.create({
      data: {
        orgId: params.orgId,
        ticketId: params.ticketId,
        agentRunId: params.runId,
        body: params.body,
        status: params.status,
        createdBy: 'agent',
        createdByType: AGENT_ACTOR,
        approvedBy: params.status === DraftStatus.APPROVED ? 'agent' : null,
        approvedByType:
          params.status === DraftStatus.APPROVED ? AGENT_ACTOR : null,
      },
    });
  }

  private async ensureApproval(params: {
    orgId: string;
    ticketId: string;
    runId: string;
    draftId: string;
    proposedResponse: string;
  }) {
    const existing = await this.prisma.humanApproval.findFirst({
      where: {
        orgId: params.orgId,
        ticketId: params.ticketId,
        agentRunId: params.runId,
        outboundDraftId: params.draftId,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.humanApproval.create({
      data: {
        orgId: params.orgId,
        ticketId: params.ticketId,
        agentRunId: params.runId,
        outboundDraftId: params.draftId,
        status: ApprovalStatus.PENDING,
        proposedResponse: params.proposedResponse,
      },
    });
  }

  private async recordOperationalFailure(
    job: Job<TicketProcessJob>,
    errorCode: string,
    safeErrorMessage: string,
    attemptCount: number,
  ) {
    const existing = await this.prisma.operationalFailure.findFirst({
      where: {
        runId: job.data.runId,
        queueName: job.queueName,
        jobName: job.name,
        resolvedAt: null,
      },
      orderBy: { failedAt: 'desc' },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.operationalFailure.update({
        where: { id: existing.id },
        data: {
          jobId: String(job.id),
          correlationId: job.data.correlationId ?? null,
          errorCode,
          safeErrorMessage,
          attemptCount,
          payloadSummaryJson: sanitizeForLog(job.data) as Prisma.InputJsonValue,
          failedAt: new Date(),
        },
      });

      return existing.id;
    }

    const failure = await this.prisma.operationalFailure.create({
      data: {
        organizationId: job.data.orgId,
        queueName: job.queueName,
        jobName: job.name,
        jobId: String(job.id),
        correlationId: job.data.correlationId ?? null,
        ticketId: job.data.ticketId,
        runId: job.data.runId,
        errorCode,
        safeErrorMessage,
        attemptCount,
        payloadSummaryJson: sanitizeForLog(job.data) as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    return failure.id;
  }
}
