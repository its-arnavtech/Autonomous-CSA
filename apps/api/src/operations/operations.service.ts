import {
  AgentEventType,
  AgentRunStatus,
  AgentRunTrigger,
  ApprovalStatus,
  MessageDirection,
  Prisma,
  nextEventSequence,
} from '@agentic-support/db';
import {
  getCorrelationContext,
  sanitizeForLog,
} from '@agentic-support/observability';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { SUPPORT_QUEUE_NAME } from '../queue/queue.config';
import {
  OperationsAuditQueryDto,
  OperationsFailuresQueryDto,
  OperationsRunsQueryDto,
} from './operations.dto';

function clampLimit(value: number | undefined, fallback: number, max: number) {
  if (!value || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(Math.max(value, 1), max);
}

function sanitizeCsvCell(value: unknown) {
  const text =
    typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(SUPPORT_QUEUE_NAME) private readonly queue: Queue,
  ) {}

  async getSummary(orgId: string) {
    const [
      ticketStatusGroups,
      runStatusGroups,
      blockedRuns,
      pendingApprovals,
      recentFailures,
      unresolvedFailures,
      llmUsage,
      runDurations,
      queuedRuns,
    ] = await Promise.all([
      this.prisma.ticket.groupBy({
        by: ['status'],
        where: { orgId },
        _count: { _all: true },
      }),
      this.prisma.agentRun.groupBy({
        by: ['status'],
        where: { orgId },
        _count: { _all: true },
      }),
      this.prisma.agentRun.count({
        where: { orgId, status: AgentRunStatus.BLOCKED },
      }),
      this.prisma.humanApproval.count({
        where: { orgId, status: ApprovalStatus.PENDING },
      }),
      this.prisma.operationalFailure.findMany({
        where: { organizationId: orgId },
        orderBy: { failedAt: 'desc' },
        take: 5,
      }),
      this.prisma.operationalFailure.count({
        where: { organizationId: orgId, resolvedAt: null },
      }),
      this.prisma.agentStep.aggregate({
        where: { orgId },
        _sum: {
          inputTokens: true,
          outputTokens: true,
          estimatedCostCents: true,
        },
      }),
      this.prisma.agentRun.aggregate({
        where: { orgId, durationMs: { not: null } },
        _avg: { durationMs: true },
      }),
      this.prisma.agentRun.count({
        where: {
          orgId,
          status: { in: [AgentRunStatus.QUEUED, AgentRunStatus.RUNNING] },
        },
      }),
    ]);

    return {
      ticketsByStatus: ticketStatusGroups.map((group) => ({
        status: group.status,
        count: group._count._all,
      })),
      runsByStatus: runStatusGroups.map((group) => ({
        status: group.status,
        count: group._count._all,
      })),
      blockedRuns,
      pendingApprovals,
      recentFailures: recentFailures.map((failure) => ({
        id: failure.id,
        queueName: failure.queueName,
        jobName: failure.jobName,
        errorCode: failure.errorCode,
        safeErrorMessage: failure.safeErrorMessage,
        failedAt: failure.failedAt,
        resolvedAt: failure.resolvedAt,
        ticketId: failure.ticketId,
        runId: failure.runId,
        correlationId: failure.correlationId,
      })),
      llmUsage: {
        inputTokens: llmUsage._sum.inputTokens ?? 0,
        outputTokens: llmUsage._sum.outputTokens ?? 0,
        estimatedCostCents: llmUsage._sum.estimatedCostCents ?? 0,
      },
      averageRunDurationMs: Math.round(runDurations._avg.durationMs ?? 0),
      queueHealth: {
        activeRuns: queuedRuns,
        unresolvedFailures,
      },
    };
  }

  async listRuns(orgId: string, query: OperationsRunsQueryDto) {
    return this.prisma.agentRun.findMany({
      where: {
        orgId,
        status: query.status as AgentRunStatus | undefined,
        ticketId: query.ticketId,
        correlationId: query.correlationId,
      },
      orderBy: [{ createdAt: 'desc' }],
      take: clampLimit(query.limit, 25, 100),
      include: {
        ticket: {
          select: {
            id: true,
            subject: true,
            status: true,
            customerEmail: true,
          },
        },
      },
    });
  }

  async getRun(orgId: string, runId: string) {
    const run = await this.prisma.agentRun.findFirst({
      where: { id: runId, orgId },
      include: {
        steps: {
          orderBy: { createdAt: 'asc' },
        },
        ticket: {
          select: {
            id: true,
            subject: true,
            status: true,
            customerEmail: true,
            messages: {
              where: { direction: MessageDirection.INBOUND },
              orderBy: { createdAt: 'asc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException('Run not found');
    }

    return run;
  }

  async listFailures(orgId: string, query: OperationsFailuresQueryDto) {
    const where: Prisma.OperationalFailureWhereInput = {
      organizationId: orgId,
    };

    if (query.status === 'resolved') {
      where.resolvedAt = { not: null };
    } else if (query.status === 'open') {
      where.resolvedAt = null;
    }

    return this.prisma.operationalFailure.findMany({
      where,
      orderBy: [{ failedAt: 'desc' }],
      take: clampLimit(query.limit, 25, 100),
    });
  }

  async getFailure(orgId: string, failureId: string) {
    const failure = await this.prisma.operationalFailure.findFirst({
      where: {
        id: failureId,
        organizationId: orgId,
      },
    });

    if (!failure) {
      throw new NotFoundException('Failure not found');
    }

    return failure;
  }

  async replayFailure(orgId: string, failureId: string, actorUserId: string) {
    const failure = await this.getFailure(orgId, failureId);

    if (failure.replayedJobId) {
      return {
        failureId: failure.id,
        replayRunId: null,
        replayJobId: failure.replayedJobId,
        correlationId:
          getCorrelationContext()?.correlationId ?? failure.correlationId ?? null,
        duplicateReplay: true,
      };
    }

    const sourceRun = failure.runId
      ? await this.prisma.agentRun.findFirst({
          where: { id: failure.runId, orgId },
          select: { trigger: true },
        })
      : null;
    const ticket = failure.ticketId
      ? await this.prisma.ticket.findFirst({
          where: { id: failure.ticketId, orgId },
          include: {
            messages: {
              where: { direction: MessageDirection.INBOUND },
              orderBy: { createdAt: 'asc' },
              take: 1,
            },
          },
        })
      : null;

    if (!ticket || ticket.messages.length === 0) {
      throw new NotFoundException('Ticket context for replay no longer exists');
    }

    const replayCorrelationId =
      getCorrelationContext()?.correlationId ?? failure.correlationId ?? null;
    const replayRun = await this.prisma.agentRun.create({
      data: {
        orgId,
        ticketId: ticket.id,
        status: AgentRunStatus.QUEUED,
        trigger: sourceRun?.trigger ?? AgentRunTrigger.TICKET_CREATED,
        correlationId: replayCorrelationId,
      },
    });

    const job = await this.queue.add(
      'ticket.process',
      {
        orgId,
        runId: replayRun.id,
        ticketId: ticket.id,
        subject: ticket.subject,
        body: ticket.messages[0].body,
        customerEmail: ticket.customerEmail,
        requestedByUserId: actorUserId,
        correlationId: replayCorrelationId,
        triggerType: 'FAILURE_REPLAY',
        enqueuedAt: new Date().toISOString(),
      },
      {
        jobId: `support-${replayRun.id}`,
      },
    );

    await this.prisma.operationalFailure.update({
      where: { id: failure.id },
      data: {
        replayedJobId: String(job.id),
      },
    });

    await this.prisma.$transaction(async (tx) => {
      const sequence = await nextEventSequence(tx, orgId, ticket.id);
      await tx.agentEvent.create({
        data: {
          orgId,
          ticketId: ticket.id,
          runId: replayRun.id,
          correlationId: replayCorrelationId,
          type: AgentEventType.RUN_QUEUED,
          sequence,
          payload: {
            replayOfFailureId: failure.id,
            actorUserId,
          },
        },
      });
    });

    return {
      failureId: failure.id,
      replayRunId: replayRun.id,
      replayJobId: String(job.id),
      correlationId: replayCorrelationId,
    };
  }

  async resolveFailure(
    orgId: string,
    failureId: string,
    actorUserId: string,
    note: string,
  ) {
    const failure = await this.getFailure(orgId, failureId);

    if (failure.resolvedAt) {
      return failure;
    }

    return this.prisma.operationalFailure.update({
      where: { id: failureId },
      data: {
        resolvedAt: new Date(),
        resolvedByUserId: actorUserId,
        resolutionNote: note.trim(),
      },
    });
  }

  async searchAudit(orgId: string, query: OperationsAuditQueryDto) {
    const maxRangeDays = Number.parseInt(
      process.env.OPERATIONS_MAX_AUDIT_RANGE_DAYS?.trim() ?? '31',
      10,
    );
    const end = query.endDate ? new Date(query.endDate) : new Date();
    const start = query.startDate
      ? new Date(query.startDate)
      : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    const maxStart = new Date(
      end.getTime() - Math.max(maxRangeDays, 1) * 24 * 60 * 60 * 1000,
    );
    const boundedStart = start < maxStart ? maxStart : start;

    const events = await this.prisma.agentEvent.findMany({
      where: {
        orgId,
        createdAt: {
          gte: boundedStart,
          lte: end,
        },
        type: query.eventType as any,
        ticketId: query.ticketId,
        runId: query.runId,
        correlationId: query.correlationId,
      },
      orderBy: [{ createdAt: 'desc' }, { sequence: 'desc' }],
      take: clampLimit(query.limit, 100, 1000),
    });

    return events
      .map((event) => ({
        id: event.id,
        ticketId: event.ticketId,
        runId: event.runId,
        type: event.type,
        sequence: event.sequence,
        correlationId: event.correlationId,
        createdAt: event.createdAt,
        payload: sanitizeForLog(event.payload),
      }))
      .filter((event) => {
        const payload = event.payload as Record<string, unknown>;
        if (query.actorType && payload.actorType !== query.actorType) {
          return false;
        }
        if (query.actorUserId && payload.actorUserId !== query.actorUserId) {
          return false;
        }
        if (query.outcome && payload.status !== query.outcome) {
          return false;
        }
        return true;
      });
  }

  async exportAuditCsv(orgId: string, query: OperationsAuditQueryDto) {
    const events = await this.searchAudit(orgId, query);
    const lines = [
      [
        'eventId',
        'createdAt',
        'type',
        'ticketId',
        'runId',
        'correlationId',
        'payloadSummary',
      ].join(','),
      ...events.map((event) =>
        [
          sanitizeCsvCell(event.id),
          sanitizeCsvCell(event.createdAt.toISOString()),
          sanitizeCsvCell(event.type),
          sanitizeCsvCell(event.ticketId),
          sanitizeCsvCell(event.runId),
          sanitizeCsvCell(event.correlationId),
          sanitizeCsvCell(
            JSON.stringify(sanitizeForLog(event.payload)).slice(0, 500),
          ),
        ]
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(','),
      ),
    ];

    return lines.join('\n');
  }
}
