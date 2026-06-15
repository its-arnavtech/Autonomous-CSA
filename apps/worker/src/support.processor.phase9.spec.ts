import {
  AgentRunStatus,
  ApprovalStatus,
  DraftStatus,
  GuardrailDecision,
} from '@agentic-support/db';
import { UnrecoverableError } from 'bullmq';
import { SupportProcessor } from './support.processor';

describe('Phase 9 support processor behaviors', () => {
  function createProcessor(opts?: {
    existingRun?: { status: AgentRunStatus; trigger?: string } | null;
    guardrailAggregate?: GuardrailDecision;
    runPipeline?: () => Promise<unknown>;
    existingFailureId?: string | null;
  }) {
    const prisma = {
      agentRun: {
        findUnique: jest.fn().mockResolvedValue(
          opts?.existingRun ?? {
            status: AgentRunStatus.QUEUED,
            trigger: 'TICKET_CREATED',
          },
        ),
        update: jest.fn().mockResolvedValue({}),
      },
      agentStep: {
        create: jest.fn(),
        update: jest.fn(),
      },
      organizationSettings: {
        upsert: jest.fn().mockResolvedValue({
          requireHumanApproval: false,
          maxAutoSendCostCents: 25,
          requireApprovalForLowConfidence: true,
          blockOnPiiDetection: true,
          minCriticCompletenessScore: 70,
        }),
      },
      outboundDraft: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'draft_1',
          status: DraftStatus.APPROVED,
        }),
        update: jest.fn().mockResolvedValue({
          id: 'draft_1',
          status: DraftStatus.APPROVED,
        }),
      },
      humanApproval: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'approval_1',
          status: ApprovalStatus.PENDING,
        }),
      },
      operationalFailure: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            opts?.existingFailureId ? { id: opts.existingFailureId } : null,
          ),
        create: jest.fn().mockResolvedValue({ id: 'failure_1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      agentEvent: {
        aggregate: jest.fn().mockResolvedValue({ _max: { sequence: 0 } }),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest
        .fn()
        .mockImplementation(
          async (
            arg:
              | ((tx: typeof prisma) => Promise<unknown>)
              | Array<Promise<unknown>>,
          ) => {
            if (typeof arg === 'function') {
              return arg(prisma);
            }
            return Promise.all(arg);
          },
        ),
    };

    const agentRuntimeService = {
      runPipeline:
        opts?.runPipeline ??
        jest.fn().mockResolvedValue({
          router: {
            category: 'billing',
            intent: 'assist_billing',
            urgency: 'normal',
            confidence: 0.9,
            notes: 'billing',
          },
          resolver: {
            draftBody: 'Thanks for reaching out.',
            resolutionSummary: 'Prepared a response.',
            confidence: 0.95,
            usedKnowledgeArticleIds: ['article_1'],
          },
          critic: {
            passed: true,
            safetyVerdict: 'safe',
            completenessScore: 0.95,
            issues: [],
            recommendedAction: 'approve',
          },
          estimatedCostCents: 2,
        }),
    };

    const guardrailService = {
      runAll: jest.fn().mockResolvedValue({
        checks: [],
        aggregate: opts?.guardrailAggregate ?? GuardrailDecision.ALLOW,
      }),
    };

    const metrics = {
      incrementQueueStarted: jest.fn(),
      incrementQueueCompleted: jest.fn(),
      incrementQueueFailed: jest.fn(),
      incrementQueueRetried: jest.fn(),
      observeQueueDuration: jest.fn(),
      incrementDeadLetter: jest.fn(),
      incrementAgentRun: jest.fn(),
      observeAgentRunDuration: jest.fn(),
      incrementGuardrailOutcome: jest.fn(),
      incrementApprovalRequired: jest.fn(),
      incrementDraftCreated: jest.fn(),
    };

    const deadLetterQueue = {
      add: jest.fn().mockResolvedValue({ id: 'dead-letter-job_1' }),
    };

    return {
      prisma,
      metrics,
      deadLetterQueue,
      agentRuntimeService,
      processor: new SupportProcessor(
        prisma as never,
        agentRuntimeService as never,
        guardrailService as never,
        metrics as never,
        deadLetterQueue as never,
      ),
    };
  }

  const baseJob = {
    name: 'ticket.process',
    id: 'job_1',
    queueName: 'support',
    attemptsMade: 0,
    opts: { attempts: 3 },
    data: {
      orgId: 'org_1',
      runId: 'run_1',
      ticketId: 'ticket_1',
      subject: 'Billing issue',
      body: 'Raw customer message',
      customerEmail: 'customer@example.com',
      correlationId: 'phase9-worker-correlation-1234',
      triggerType: 'TICKET_CREATED',
    },
  };

  it('stores correlation IDs in run updates and events and logs them safely', async () => {
    const { processor, prisma } = createProcessor();
    const stdoutSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await processor.process(baseJob as never);

    type CorrelatedMutationArg = { data?: { correlationId?: string } };
    const runUpdate = prisma.agentRun.update as jest.Mock<
      Promise<unknown>,
      [CorrelatedMutationArg]
    >;
    const eventCreate = prisma.agentEvent.create as jest.Mock<
      Promise<unknown>,
      [CorrelatedMutationArg]
    >;
    const runUpdateArg = runUpdate.mock.calls[0]?.[0];
    const eventCreateArg = eventCreate.mock.calls[0]?.[0];

    expect(runUpdateArg?.data?.correlationId).toBe(
      'phase9-worker-correlation-1234',
    );
    expect(eventCreateArg?.data?.correlationId).toBe(
      'phase9-worker-correlation-1234',
    );
    const output = stdoutSpy.mock.calls
      .map(([chunk]) => String(chunk))
      .join('');
    expect(output).toContain('phase9-worker-correlation-1234');
    expect(output).not.toContain('customer@example.com');

    stdoutSpy.mockRestore();
  });

  it('skips duplicate terminal runs without duplicating drafts or approvals', async () => {
    const { processor, prisma, agentRuntimeService } = createProcessor({
      existingRun: {
        status: AgentRunStatus.SUCCEEDED,
        trigger: 'TICKET_CREATED',
      },
    });

    const result = await processor.process(baseJob as never);

    expect(result).toEqual({ ok: true, skipped: true });
    expect(agentRuntimeService.runPipeline).not.toHaveBeenCalled();
    expect(prisma.outboundDraft.create).not.toHaveBeenCalled();
    expect(prisma.humanApproval.create).not.toHaveBeenCalled();
    expect(prisma.agentEvent.create).not.toHaveBeenCalled();
  });

  it('retries transient failures without dead-lettering before attempts are exhausted', async () => {
    const { processor, metrics, deadLetterQueue } = createProcessor({
      runPipeline: jest
        .fn()
        .mockRejectedValue(new Error('OpenAI API error 503: temporary outage')),
    });

    await expect(processor.process(baseJob as never)).rejects.toThrow(
      'temporary outage',
    );

    expect(metrics.incrementQueueRetried).toHaveBeenCalledWith(
      'ticket.process',
      'timeout',
    );
    expect(deadLetterQueue.add).not.toHaveBeenCalled();
  });

  it('dead-letters non-retryable failures immediately', async () => {
    const { processor, deadLetterQueue, metrics } = createProcessor({
      runPipeline: jest
        .fn()
        .mockRejectedValue(new Error('schema validation failed for payload')),
    });

    await expect(processor.process(baseJob as never)).rejects.toBeInstanceOf(
      UnrecoverableError,
    );

    expect(deadLetterQueue.add).toHaveBeenCalledTimes(1);
    expect(metrics.incrementDeadLetter).toHaveBeenCalledWith(
      'ticket.process',
      'validation_error',
    );
  });

  it('updates an existing operational failure instead of creating duplicates', async () => {
    const { processor, prisma } = createProcessor({
      existingFailureId: 'failure_existing',
      runPipeline: jest
        .fn()
        .mockRejectedValue(new Error('schema validation failed')),
    });

    await expect(processor.process(baseJob as never)).rejects.toBeInstanceOf(
      UnrecoverableError,
    );

    expect(prisma.operationalFailure.create).not.toHaveBeenCalled();
    expect(prisma.operationalFailure.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'failure_existing' },
      }),
    );
  });

  it('does not dead-letter blocked runs', async () => {
    const { processor, deadLetterQueue, metrics } = createProcessor({
      guardrailAggregate: GuardrailDecision.BLOCK,
    });

    const result = await processor.process(baseJob as never);

    expect(result).toEqual({ ok: true, status: AgentRunStatus.BLOCKED });
    expect(deadLetterQueue.add).not.toHaveBeenCalled();
    expect(metrics.incrementQueueFailed).not.toHaveBeenCalled();
  });
});
