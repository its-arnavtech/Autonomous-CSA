import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  AgentEventType,
  AgentRunStatus,
  DraftStatus,
  Prisma,
  nextEventSequence,
} from '@agentic-support/db';
import { AgentRuntimeService } from './agent-runtime/agent-runtime.service';
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

const pendingApprovalStatus = 'PENDING' as const;
const humanStubApprover = 'human_stub';

@Processor('support')
export class SupportProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentRuntimeService: AgentRuntimeService,
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
        console.log(`[worker] subject: ${subject}`);

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

        const criticBlocked = !pipeline.critic.passed;
        const draft = await this.prisma.outboundDraft.create({
          data: {
            orgId,
            ticketId,
            agentRunId: runId,
            body: pipeline.resolver.draftBody,
            status: criticBlocked
              ? DraftStatus.DRAFT
              : settings.requireHumanApproval
                ? DraftStatus.PENDING_APPROVAL
                : DraftStatus.APPROVED,
            createdBy: 'agent_stub',
            approvedBy:
              criticBlocked || settings.requireHumanApproval
                ? null
                : humanStubApprover,
          },
        });

        await this.appendAgentEvent({
          orgId,
          ticketId,
          runId,
          type: AgentEventType.DRAFT_CREATED,
          payload: {
            draftId: draft.id,
            status: draft.status,
          },
        });

        if (criticBlocked) {
          await this.appendAgentEvent({
            orgId,
            ticketId,
            runId,
            type: AgentEventType.CRITIC_BLOCKED,
            payload: {
              draftId: draft.id,
              status: draft.status,
              issues: pipeline.critic.issues,
            },
          });
        } else if (settings.requireHumanApproval) {
          await this.prisma.humanApproval.create({
            data: {
              orgId,
              ticketId,
              agentRunId: runId,
              outboundDraftId: draft.id,
              status: pendingApprovalStatus,
              proposedResponse: pipeline.resolver.draftBody,
            },
          });

          await this.appendAgentEvent({
            orgId,
            ticketId,
            runId,
            type: AgentEventType.HUMAN_APPROVAL_CREATED,
            payload: {
              status: pendingApprovalStatus,
              proposedResponse: pipeline.resolver.draftBody,
              draftId: draft.id,
            },
          });
        } else {
          await this.appendAgentEvent({
            orgId,
            ticketId,
            runId,
            type: AgentEventType.DRAFT_AUTO_APPROVED,
            payload: {
              draftId: draft.id,
              status: DraftStatus.APPROVED,
            },
          });
        }

        await this.appendAgentEvent({
          orgId,
          ticketId,
          runId,
          type: AgentEventType.RUN_FINISHED,
          payload: { status: 'SUCCEEDED' },
        });

        await this.prisma.agentRun.update({
          where: { id: runId },
          data: {
            status: criticBlocked
              ? AgentRunStatus.BLOCKED
              : AgentRunStatus.SUCCEEDED,
            finishedAt: new Date(),
          },
        });

        return { ok: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const errorDetails =
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : { value: String(error) };

        console.error('[worker] ticket processing failed', {
          ticketId,
          runId,
          error: errorDetails,
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
