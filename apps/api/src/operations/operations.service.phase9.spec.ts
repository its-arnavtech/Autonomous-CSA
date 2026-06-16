import { NotFoundException } from '@nestjs/common';
import { AgentRunTrigger, MessageDirection } from '@agentic-support/db';
import { runWithCorrelationContext } from '@agentic-support/observability';
import { OperationsService } from './operations.service';

describe('Phase 9 operations service', () => {
  function createService(overrides?: {
    failure?: Record<string, unknown> | null;
    replayedJobId?: string | null;
    resolvedAt?: Date | null;
  }) {
    const failure = {
      id: 'failure_1',
      organizationId: 'org_1',
      queueName: 'support',
      jobName: 'ticket.process',
      jobId: 'job_1',
      correlationId: 'failure-correlation',
      ticketId: 'ticket_1',
      runId: 'run_failed',
      errorCode: 'VALIDATION_ERROR',
      safeErrorMessage: 'safe',
      attemptCount: 3,
      payloadSummaryJson: { body: 'stale payload body' },
      failedAt: new Date(),
      resolvedAt: overrides?.resolvedAt ?? null,
      resolvedByUserId: null,
      resolutionNote: null,
      replayedJobId: overrides?.replayedJobId ?? null,
      ...overrides?.failure,
    };

    const prisma = {
      agentRun: {
        findFirst: jest.fn().mockResolvedValue({
          trigger: AgentRunTrigger.TICKET_CREATED,
        }),
        create: jest.fn().mockResolvedValue({ id: 'run_replay_1' }),
      },
      ticket: {
        groupBy: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue({
          id: 'ticket_1',
          subject: 'Billing issue',
          customerEmail: 'customer@example.com',
          messages: [
            {
              direction: MessageDirection.INBOUND,
              body: 'fresh inbound body',
            },
          ],
        }),
      },
      operationalFailure: {
        findFirst: jest.fn().mockResolvedValue(failure),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest
          .fn()
          .mockResolvedValue({ ...failure, replayedJobId: 'support-run_replay_1' }),
      },
      agentEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'event_1',
            ticketId: 'ticket_1',
            runId: 'run_1',
            type: 'RUN_STARTED',
            sequence: 1,
            correlationId: '=SUM(A1:A2)',
            createdAt: new Date('2026-06-15T00:00:00.000Z'),
            payload: { formula: '=SUM(A1:A2)' },
          },
        ]),
      },
      humanApproval: { count: jest.fn().mockResolvedValue(0) },
      agentStep: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { inputTokens: 0, outputTokens: 0, estimatedCostCents: 0 },
        }),
      },
      $transaction: jest.fn().mockImplementation(async (callback: any) =>
        callback({
          agentEvent: {
            aggregate: jest.fn().mockResolvedValue({ _max: { sequence: 0 } }),
            create: jest.fn().mockResolvedValue({}),
          },
        }),
      ),
    } as any;

    prisma.operationalFailure.count = jest.fn().mockResolvedValue(0);

    const queue = {
      add: jest.fn().mockResolvedValue({ id: 'support-run_replay_1' }),
    };

    return {
      prisma,
      queue,
      service: new OperationsService(prisma as never, queue as never),
    };
  }

  it('replays using trusted current ticket context instead of stale failure payloads', async () => {
    const { service, prisma, queue } = createService();

    const result = await runWithCorrelationContext(
      { correlationId: 'phase9-replay-correlation-1234' },
      () => service.replayFailure('org_1', 'failure_1', 'user_1'),
    );

    expect(result.replayRunId).toBe('run_replay_1');
    expect(queue.add).toHaveBeenCalledWith(
      'ticket.process',
      expect.objectContaining({
        body: 'fresh inbound body',
        correlationId: 'phase9-replay-correlation-1234',
      }),
      expect.any(Object),
    );
    expect(prisma.operationalFailure.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'failure_1' },
      }),
    );
  });

  it('handles duplicate replay attempts safely', async () => {
    const { service, queue } = createService({
      replayedJobId: 'support-existing',
    });

    const result = await service.replayFailure('org_1', 'failure_1', 'user_1');

    expect(result).toMatchObject({
      failureId: 'failure_1',
      replayRunId: null,
      replayJobId: 'support-existing',
      duplicateReplay: true,
    });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('treats a lost replay claim as a duplicate replay attempt', async () => {
    const { service, prisma, queue } = createService();
    prisma.operationalFailure.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await service.replayFailure('org_1', 'failure_1', 'user_1');

    expect(result.duplicateReplay).toBe(true);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('returns a safe 404 for cross-tenant failure lookups', async () => {
    const { service, prisma } = createService();
    prisma.operationalFailure.findFirst.mockResolvedValueOnce(null);

    await expect(service.getFailure('org_other', 'failure_1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('resolves failures idempotently', async () => {
    const resolvedAt = new Date('2026-06-15T01:00:00.000Z');
    const { service, prisma } = createService({ resolvedAt });

    const result = await service.resolveFailure(
      'org_1',
      'failure_1',
      'user_1',
      'Already handled',
    );

    expect(result.resolvedAt).toBe(resolvedAt);
    expect(prisma.operationalFailure.update).not.toHaveBeenCalled();
  });

  it('records resolver identity and note when resolving an open failure', async () => {
    const { service, prisma } = createService({ resolvedAt: null });

    await service.resolveFailure('org_1', 'failure_1', 'user_1', 'Fixed safely');

    expect(prisma.operationalFailure.update).toHaveBeenCalledWith({
      where: { id: 'failure_1' },
      data: {
        resolvedAt: expect.any(Date),
        resolvedByUserId: 'user_1',
        resolutionNote: 'Fixed safely',
      },
    });
  });

  it('escapes CSV formula injection safely', async () => {
    const { service } = createService();

    const csv = await service.exportAuditCsv('org_1', { limit: 10 } as never);

    expect(csv).toContain(`"'=SUM(A1:A2)"`);
  });
});
