import {
  AgentEventType,
  AgentRunStatus,
  DraftStatus,
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
  function createProcessor(requireHumanApproval: boolean) {
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
        upsert: jest.fn().mockResolvedValue({ requireHumanApproval }),
      },
      outboundDraft: {
        create: jest.fn().mockResolvedValue({
          id: 'draft_1',
          status: requireHumanApproval
            ? DraftStatus.PENDING_APPROVAL
            : DraftStatus.APPROVED,
        }),
      },
      humanApproval: { create: jest.fn().mockResolvedValue({}) },
      agentEvent: {
        aggregate: jest.fn().mockResolvedValue({ _max: { sequence: 1 } }),
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockImplementation(
        async (callback: (tx: typeof prisma) => Promise<unknown>) =>
          callback(prisma),
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

    return {
      prisma,
      agentRuntimeService,
      processor: new SupportProcessor(
        prisma as never,
        agentRuntimeService as never,
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
    expect(approvalEventCall?.[0].data.type).toBe(
      AgentEventType.HUMAN_APPROVAL_CREATED,
    );

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

  it('blocks the run when the critic rejects the draft', async () => {
    const { prisma, processor, agentRuntimeService } = createProcessor(true);
    agentRuntimeService.runPipeline.mockResolvedValue({
      router: {
        category: 'technical',
        intent: 'investigate_bug_report',
        urgency: 'high',
        confidence: 0.82,
        notes: 'technical',
      },
      resolver: {
        draftBody: 'TBD',
        resolutionSummary: 'Draft needs more detail.',
        confidence: 0.4,
      },
      critic: {
        passed: false,
        safetyVerdict: 'needs_review',
        completenessScore: 0.2,
        issues: ['Draft is too short'],
        recommendedAction: 'block',
      },
    });

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
    expect(blockedDraftCreate?.data.body).toBe('TBD');
    expect(blockedDraftCreate?.data.status).toBe(DraftStatus.DRAFT);
    expect(blockedDraftCreate?.data.approvedBy).toBeNull();
    expect(prisma.humanApproval.create).not.toHaveBeenCalled();

    const agentEventCalls = prisma.agentEvent.create.mock
      .calls as AgentEventCreateArgs[][];
    expect(
      agentEventCalls.some(
        ([args]) => args.data.type === AgentEventType.CRITIC_BLOCKED,
      ),
    ).toBe(true);

    const runUpdateCalls = prisma.agentRun.update.mock
      .calls as AgentRunUpdateArgs[][];
    const lastRunUpdate = runUpdateCalls[runUpdateCalls.length - 1]?.[0];
    expect(lastRunUpdate?.data.status).toBe(AgentRunStatus.BLOCKED);
  });
});
