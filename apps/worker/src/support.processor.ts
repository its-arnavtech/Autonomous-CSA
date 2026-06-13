import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { AgentEventType, AgentRunStatus, Prisma } from '@agentic-support/db';
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
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job) {
    if (job.name === 'ticket.process') {
      const { orgId, orgSlug, runId, ticketId, subject } = job.data as TicketProcessJob;

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
          sequence: 2,
          type: AgentEventType.RUN_STARTED,
          payload: { jobId: job.id, subject },
        });

        console.log(
          `[worker] processing ticket ${ticketId} for org ${orgSlug ?? orgId}`,
        );
        console.log(`[worker] subject: ${subject}`);

        await this.appendAgentEvent({
          orgId,
          ticketId,
          runId,
          sequence: 3,
          type: AgentEventType.ROUTER_DECISION,
          payload: {
            action: 'DRAFT_FOR_HUMAN',
            confidence: 0.62,
            reason: 'stubbed',
          },
        });

        await this.appendAgentEvent({
          orgId,
          ticketId,
          runId,
          sequence: 4,
          type: AgentEventType.RUN_FINISHED,
          payload: { status: 'SUCCEEDED' },
        });

        await this.prisma.agentRun.update({
          where: { id: runId },
          data: {
            status: AgentRunStatus.SUCCEEDED,
            finishedAt: new Date(),
          },
        });

        return { ok: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        await this.appendAgentEvent({
          orgId,
          ticketId,
          runId,
          sequence: 99,
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
    sequence: number;
    type: AgentEventType;
    payload: Prisma.InputJsonValue;
  }) {
    await this.prisma.agentEvent.create({
      data: {
        orgId: params.orgId,
        ticketId: params.ticketId,
        runId: params.runId,
        sequence: params.sequence,
        type: params.type,
        payload: params.payload,
      },
    });
  }
}
