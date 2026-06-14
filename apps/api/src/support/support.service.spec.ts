import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  AgentEventType,
  DraftStatus,
  MessageDirection,
  MessageStatus,
  TicketPriority,
  TicketStatus,
} from '@agentic-support/db';
import { SupportService } from './support.service';

describe('SupportService', () => {
  function createService() {
    const prisma = {
      organization: { findUnique: jest.fn() },
      ticket: { findFirst: jest.fn() },
      agentStep: { findMany: jest.fn() },
      knowledgeRetrieval: { findMany: jest.fn() },
      outboundDraft: { findFirst: jest.fn() },
      ticketMessage: { create: jest.fn() },
      organizationSettings: { upsert: jest.fn() },
      $transaction: jest.fn(),
    };

    return {
      prisma,
      service: new SupportService(prisma as never),
    };
  }

  it('requires the correct orgId to update ticket status', async () => {
    const { prisma, service } = createService();
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org_1',
      slug: 'org_demo',
    });
    prisma.ticket.findFirst.mockResolvedValue(null);

    await expect(
      service.updateTicketStatus('ticket_1', 'org_demo', TicketStatus.RESOLVED),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('requires the correct orgId to update ticket priority', async () => {
    const { prisma, service } = createService();
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org_1',
      slug: 'org_demo',
    });
    prisma.ticket.findFirst.mockResolvedValue(null);

    await expect(
      service.updateTicketPriority('ticket_1', 'org_demo', TicketPriority.HIGH),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('bootstraps default organization settings', async () => {
    const { prisma, service } = createService();
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org_1',
      slug: 'org_demo',
    });
    prisma.organizationSettings.upsert.mockResolvedValue({
      orgId: 'org_1',
      autoRespond: false,
      requireHumanApproval: true,
      maxAgentCostCents: 50,
    });

    const settings = await service.getOrCreateOrganizationSettings('org_demo');

    expect(prisma.organizationSettings.upsert).toHaveBeenCalledWith({
      where: { orgId: 'org_1' },
      update: {},
      create: { orgId: 'org_1' },
    });
    expect(settings.requireHumanApproval).toBe(true);
  });

  it('writes a timeline event when ticket status changes', async () => {
    const { prisma, service } = createService();
    const tx = {
      ticket: {
        update: jest
          .fn()
          .mockResolvedValue({ id: 'ticket_1', status: TicketStatus.CLOSED }),
      },
      agentEvent: {
        aggregate: jest.fn().mockResolvedValue({ _max: { sequence: 4 } }),
        create: jest.fn().mockResolvedValue({}),
      },
    };

    prisma.organization.findUnique.mockResolvedValue({
      id: 'org_1',
      slug: 'org_demo',
    });
    prisma.ticket.findFirst.mockResolvedValue({
      id: 'ticket_1',
      orgId: 'org_1',
    });
    prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );

    await service.updateTicketStatus(
      'ticket_1',
      'org_demo',
      TicketStatus.CLOSED,
    );

    expect(tx.agentEvent.create).toHaveBeenCalledWith({
      data: {
        orgId: 'org_1',
        ticketId: 'ticket_1',
        type: AgentEventType.TICKET_STATUS_CHANGED,
        sequence: 5,
        payload: { status: TicketStatus.CLOSED },
      },
    });
  });

  it('creates a manual draft and appends DRAFT_CREATED', async () => {
    const { prisma, service } = createService();
    const tx = {
      outboundDraft: {
        create: jest
          .fn()
          .mockResolvedValue({ id: 'draft_1', status: DraftStatus.DRAFT }),
      },
      agentEvent: {
        aggregate: jest.fn().mockResolvedValue({ _max: { sequence: 4 } }),
        create: jest.fn().mockResolvedValue({}),
      },
    };

    prisma.organization.findUnique.mockResolvedValue({
      id: 'org_1',
      slug: 'org_demo',
    });
    prisma.ticket.findFirst.mockResolvedValue({
      id: 'ticket_1',
      orgId: 'org_1',
    });
    prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );

    const draft = await service.createManualDraft(
      'ticket_1',
      'org_demo',
      'Manual draft',
    );

    expect(tx.outboundDraft.create).toHaveBeenCalledWith({
      data: {
        orgId: 'org_1',
        ticketId: 'ticket_1',
        body: 'Manual draft',
        status: DraftStatus.DRAFT,
        createdBy: 'human_stub',
      },
    });
    expect(tx.agentEvent.create).toHaveBeenCalledWith({
      data: {
        orgId: 'org_1',
        ticketId: 'ticket_1',
        runId: undefined,
        type: AgentEventType.DRAFT_CREATED,
        sequence: 5,
        payload: { draftId: 'draft_1', status: DraftStatus.DRAFT },
      },
    });
    expect(draft.id).toBe('draft_1');
  });

  it('edits a non-sent draft', async () => {
    const { prisma, service } = createService();
    const tx = {
      outboundDraft: {
        update: jest.fn().mockResolvedValue({
          id: 'draft_1',
          body: 'Updated body',
          status: DraftStatus.APPROVED,
        }),
      },
      agentEvent: {
        aggregate: jest.fn().mockResolvedValue({ _max: { sequence: 4 } }),
        create: jest.fn().mockResolvedValue({}),
      },
    };

    prisma.organization.findUnique.mockResolvedValue({
      id: 'org_1',
      slug: 'org_demo',
    });
    prisma.outboundDraft.findFirst.mockResolvedValue({
      id: 'draft_1',
      orgId: 'org_1',
      ticketId: 'ticket_1',
      agentRunId: 'run_1',
      status: DraftStatus.APPROVED,
      approvals: [],
    });
    prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );

    const draft = await service.editDraft(
      'draft_1',
      'org_demo',
      'Updated body',
    );

    expect(tx.outboundDraft.update).toHaveBeenCalledWith({
      where: { id: 'draft_1' },
      data: { body: 'Updated body' },
    });
    expect(draft.body).toBe('Updated body');
  });

  it('does not allow editing a sent draft', async () => {
    const { prisma, service } = createService();

    prisma.organization.findUnique.mockResolvedValue({
      id: 'org_1',
      slug: 'org_demo',
    });
    prisma.outboundDraft.findFirst.mockResolvedValue({
      id: 'draft_1',
      orgId: 'org_1',
      ticketId: 'ticket_1',
      status: DraftStatus.SENT,
      approvals: [],
    });

    await expect(
      service.editDraft('draft_1', 'org_demo', 'Updated body'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sends an approved draft and creates an outbound message', async () => {
    const { prisma, service } = createService();
    const tx = {
      ticketMessage: {
        create: jest
          .fn()
          .mockResolvedValue({ id: 'msg_1', body: 'Reply body' }),
      },
      outboundDraft: {
        update: jest
          .fn()
          .mockResolvedValue({ id: 'draft_1', status: DraftStatus.SENT }),
      },
      ticket: { update: jest.fn().mockResolvedValue({}) },
      agentEvent: {
        aggregate: jest
          .fn()
          .mockResolvedValueOnce({ _max: { sequence: 4 } })
          .mockResolvedValueOnce({ _max: { sequence: 5 } }),
        create: jest.fn().mockResolvedValue({}),
      },
    };

    prisma.organization.findUnique.mockResolvedValue({
      id: 'org_1',
      slug: 'org_demo',
    });
    prisma.outboundDraft.findFirst.mockResolvedValue({
      id: 'draft_1',
      orgId: 'org_1',
      ticketId: 'ticket_1',
      agentRunId: 'run_1',
      body: 'Reply body',
      status: DraftStatus.APPROVED,
      approvals: [],
    });
    prisma.organizationSettings.upsert.mockResolvedValue({
      orgId: 'org_1',
      requireHumanApproval: true,
    });
    prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );

    const result = await service.sendDraft('draft_1', 'org_demo');

    expect(tx.ticketMessage.create).toHaveBeenCalledWith({
      data: {
        orgId: 'org_1',
        ticketId: 'ticket_1',
        body: 'Reply body',
        direction: MessageDirection.OUTBOUND,
        status: MessageStatus.SENT,
      },
    });
    expect(result.message.id).toBe('msg_1');
  });

  it('rejects sending an unapproved draft when human approval is required', async () => {
    const { prisma, service } = createService();

    prisma.organization.findUnique.mockResolvedValue({
      id: 'org_1',
      slug: 'org_demo',
    });
    prisma.outboundDraft.findFirst.mockResolvedValue({
      id: 'draft_1',
      orgId: 'org_1',
      ticketId: 'ticket_1',
      status: DraftStatus.PENDING_APPROVAL,
      approvals: [],
    });
    prisma.organizationSettings.upsert.mockResolvedValue({
      orgId: 'org_1',
      requireHumanApproval: true,
    });

    await expect(
      service.sendDraft('draft_1', 'org_demo'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('prevents wrong org access to a draft', async () => {
    const { prisma, service } = createService();
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org_2',
      slug: 'org_other',
    });
    prisma.outboundDraft.findFirst.mockResolvedValue(null);

    await expect(
      service.getDraftOrThrow('draft_1', 'org_other'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns latest agent steps for a ticket', async () => {
    const { prisma, service } = createService();
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org_1',
      slug: 'org_demo',
    });
    prisma.ticket.findFirst.mockResolvedValue({
      id: 'ticket_1',
      orgId: 'org_1',
      agentRuns: [{ id: 'run_2' }],
    });
    prisma.agentStep.findMany.mockResolvedValue([
      { id: 'step_1', stepType: 'ROUTER' },
      { id: 'step_2', stepType: 'RESOLVER' },
    ]);

    const steps = await service.getAgentSteps('ticket_1', 'org_demo');

    expect(prisma.agentStep.findMany).toHaveBeenCalledWith({
      where: {
        orgId: 'org_1',
        agentRunId: 'run_2',
      },
      orderBy: [{ createdAt: 'asc' }],
    });
    expect(steps).toHaveLength(2);
  });

  it('returns an empty list when a ticket has no agent runs', async () => {
    const { prisma, service } = createService();
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org_1',
      slug: 'org_demo',
    });
    prisma.ticket.findFirst.mockResolvedValue({
      id: 'ticket_1',
      orgId: 'org_1',
      agentRuns: [],
    });

    const steps = await service.getAgentSteps('ticket_1', 'org_demo');

    expect(steps).toEqual([]);
    expect(prisma.agentStep.findMany).not.toHaveBeenCalled();
  });

  it('returns retrieval traces newest first for a ticket', async () => {
    const { prisma, service } = createService();
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org_1',
      slug: 'org_demo',
    });
    prisma.ticket.findFirst.mockResolvedValue({
      id: 'ticket_1',
      orgId: 'org_1',
    });
    prisma.knowledgeRetrieval.findMany.mockResolvedValue([
      { id: 'retrieval_2' },
      { id: 'retrieval_1' },
    ]);

    const retrievals = await service.getRetrievals('ticket_1', 'org_demo');

    expect(prisma.knowledgeRetrieval.findMany).toHaveBeenCalledWith({
      where: {
        orgId: 'org_1',
        ticketId: 'ticket_1',
      },
      orderBy: [{ createdAt: 'desc' }],
    });
    expect(retrievals).toHaveLength(2);
  });
});
