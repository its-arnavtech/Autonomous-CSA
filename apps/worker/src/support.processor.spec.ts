import {
  AgentEventType,
  AgentRunStatus,
  DraftStatus,
  GuardrailDecision,
} from '@agentic-support/db';
import { SupportProcessor } from './support.processor';

type AgentEventCreateArgs = {
  data: {
    type: AgentEventType;
  };
};

type AgentRunUpdateArgs = {
  where: { id: string };
  data: {
    status: AgentRunStatus;
    finishedAt?: Date;
  };
};

type OutboundDraftCreateArgs = {
  data: {
    body: string;
    status: DraftStatus;
    approvedBy: string | null;
  };
};

describe('SupportProcessor', () => {
  function createProcessor(
    requireHumanApproval: boolean,
    guardrailAggregate: GuardrailDecision = GuardrailDecision.ALLOW,
  ) {
    const prisma = {
      agentRun: { update: jest.fn().mockResolvedValue({}) },
      agentStep: {
        create: jest
          .fn()
          .mockResolvedValueOnce({ id: 'step_router' })
          .mockResolvedValueOnce({ id: 'step_resolver' })
          .mockResolvedValueOnce({ id: 'step_critic' }),
        update: jest.fn().mockResolvedValue({}),
      },
      organizationSettings: {
        upsert: jest.fn().mockResolvedValue({
          requireHumanApproval,
          maxAutoSendCostCents: 25,
          requireApprovalForLowConfidence: true,
          blockOnPiiDetection: true,
          minCriticCompletenessScore: 70,
        }),
      },
      outboundDraft: {
        create: jest.fn().mockResolvedValue({
          id: 'draft_1',
          status:
            guardrailAggregate === GuardrailDecision.BLOCK
              ? DraftStatus.DRAFT
              : guardrailAggregate === GuardrailDecision.REQUIRE_APPROVAL ||
                  requireHumanApproval
                ? DraftStatus.PENDING_APPROVAL
                : DraftStatus.APPROVED,
        }),
      },
      humanApproval: { create: jest.fn().mockResolvedValue({}) },
      agentEvent: {
        aggregate: jest.fn().mockResolvedValue({ _max: { sequence: 1 } }),
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
      runPipeline: jest.fn().mockResolvedValue({
        router: {
          category: 'billing',
          intent: 'assist_billing_issue',
          urgency: 'normal',
          confidence: 0.91,
          notes: 'billing',
        },
        resolver: {
          draftBody:
            'Thanks for reaching out. We are reviewing the payment details you mentioned and will follow up with the next steps shortly.',
          resolutionSummary: 'Prepared a billing response.',
          confidence: 0.94,
          usedKnowledgeArticleIds: ['article_1'],
        },
        critic: {
          passed: true,
          safetyVerdict: 'safe',
          completenessScore: 0.91,
          issues: [],
          recommendedAction: 'approve',
        },
      }),
    };

    const guardrailService = {
      runAll: jest.fn().mockResolvedValue({
        checks: [],
        aggregate: guardrailAggregate,
      }),
    };

    return {
      prisma,
      agentRuntimeService,
      guardrailService,
      processor: new SupportProcessor(
        prisma as never,
        agentRuntimeService as never,
        guardrailService as never,
      ),
    };
  }

  it('creates a pending approval when human approval is required', async () => {
    const { prisma, processor, agentRuntimeService } = createProcessor(true);

    await processor.process({
      name: 'ticket.process',
      id: 'job_1',
      data: {
        orgId: 'org_1',
        runId: 'run_1',
        ticketId: 'ticket_1',
        subject: 'Billing issue',
      },
    } as never);

    expect(agentRuntimeService.runPipeline).toHaveBeenCalled();
    expect(prisma.organizationSettings.upsert).toHaveBeenCalledWith({
      where: { orgId: 'org_1' },
      update: {},
      create: { orgId: 'org_1' },
    });
    expect(prisma.outboundDraft.create).toHaveBeenCalledWith({
      data: {
        orgId: 'org_1',
        ticketId: 'ticket_1',
        agentRunId: 'run_1',
        body: 'Thanks for reaching out. We are reviewing the payment details you mentioned and will follow up with the next steps shortly.',
        status: DraftStatus.PENDING_APPROVAL,
        createdBy: 'agent_stub',
        approvedBy: null,
      },
    });
    expect(prisma.humanApproval.create).toHaveBeenCalledWith({
      data: {
        orgId: 'org_1',
        ticketId: 'ticket_1',
        agentRunId: 'run_1',
        outboundDraftId: 'draft_1',
        status: 'PENDING',
        proposedResponse:
          'Thanks for reaching out. We are reviewing the payment details you mentioned and will follow up with the next steps shortly.',
      },
    });
    const agentEventCalls = prisma.agentEvent.create.mock
      .calls as AgentEventCreateArgs[][];
    const approvalEventCall = agentEventCalls.find(
      ([args]) => args.data.type === AgentEventType.HUMAN_APPROVAL_CREATED,
    );

    expect(approvalEventCall).toBeDefined();

    const runUpdateCalls = prisma.agentRun.update.mock
      .calls as AgentRunUpdateArgs[][];
    const lastRunUpdate = runUpdateCalls[runUpdateCalls.length - 1]?.[0];

    expect(lastRunUpdate?.where.id).toBe('run_1');
    expect(lastRunUpdate?.data.status).toBe(AgentRunStatus.SUCCEEDED);
    expect(lastRunUpdate?.data.finishedAt).toBeInstanceOf(Date);
  });

  it('does not create an approval when human approval is disabled', async () => {
    const { prisma, processor } = createProcessor(false);

    await processor.process({
      name: 'ticket.process',
      id: 'job_2',
      data: {
        orgId: 'org_1',
        runId: 'run_1',
        ticketId: 'ticket_1',
        subject: 'Password reset',
      },
    } as never);

    const outboundDraftCalls = prisma.outboundDraft.create.mock.calls as Array<
      Array<{ data: { status: DraftStatus } }>
    >;
    const firstDraftCreate = outboundDraftCalls[0]?.[0];
    expect(firstDraftCreate?.data.status).toBe(DraftStatus.APPROVED);
    expect(prisma.humanApproval.create).not.toHaveBeenCalled();
    const agentEventCalls = prisma.agentEvent.create.mock
      .calls as AgentEventCreateArgs[][];
    expect(
      agentEventCalls.some(
        ([args]) => args.data.type === AgentEventType.DRAFT_AUTO_APPROVED,
      ),
    ).toBe(true);
  });

  it('blocks the run when a guardrail returns BLOCK', async () => {
    const { prisma, processor } = createProcessor(
      true,
      GuardrailDecision.BLOCK,
    );

    await processor.process({
      name: 'ticket.process',
      id: 'job_3',
      data: {
        orgId: 'org_1',
        runId: 'run_1',
        ticketId: 'ticket_1',
        subject: 'API outage',
        body: 'The API is returning 500 errors.',
      },
    } as never);

    const outboundDraftCalls = prisma.outboundDraft.create.mock
      .calls as OutboundDraftCreateArgs[][];
    const blockedDraftCreate = outboundDraftCalls[0]?.[0];
    expect(blockedDraftCreate?.data.status).toBe(DraftStatus.DRAFT);
    expect(blockedDraftCreate?.data.approvedBy).toBeNull();
    expect(prisma.humanApproval.create).not.toHaveBeenCalled();

    const agentEventCalls = prisma.agentEvent.create.mock
      .calls as AgentEventCreateArgs[][];
    expect(
      agentEventCalls.some(
        ([args]) => args.data.type === AgentEventType.GUARDRAIL_BLOCKED,
      ),
    ).toBe(true);

    const runUpdateCalls = prisma.agentRun.update.mock
      .calls as AgentRunUpdateArgs[][];
    const lastRunUpdate = runUpdateCalls[runUpdateCalls.length - 1]?.[0];
    expect(lastRunUpdate?.data.status).toBe(AgentRunStatus.BLOCKED);
  });

  it('creates an approval when guardrail returns REQUIRE_APPROVAL', async () => {
    const { prisma, processor } = createProcessor(
      false,
      GuardrailDecision.REQUIRE_APPROVAL,
    );

    await processor.process({
      name: 'ticket.process',
      id: 'job_4',
      data: {
        orgId: 'org_1',
        runId: 'run_1',
        ticketId: 'ticket_1',
        subject: 'Low confidence ticket',
      },
    } as never);

    const outboundDraftCalls = prisma.outboundDraft.create.mock.calls as Array<
      Array<{ data: { status: DraftStatus } }>
    >;
    const draftCreate = outboundDraftCalls[0]?.[0];
    expect(draftCreate?.data.status).toBe(DraftStatus.PENDING_APPROVAL);
    expect(prisma.humanApproval.create).toHaveBeenCalled();

    const agentEventCalls = prisma.agentEvent.create.mock
      .calls as AgentEventCreateArgs[][];
    expect(
      agentEventCalls.some(
        ([args]) =>
          args.data.type === AgentEventType.GUARDRAIL_REQUIRES_APPROVAL,
      ),
    ).toBe(true);

    const runUpdateCalls = prisma.agentRun.update.mock
      .calls as AgentRunUpdateArgs[][];
    const lastRunUpdate = runUpdateCalls[runUpdateCalls.length - 1]?.[0];
    expect(lastRunUpdate?.data.status).toBe(AgentRunStatus.SUCCEEDED);
  });
});
