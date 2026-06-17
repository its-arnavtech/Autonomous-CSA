import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AgentEventType,
  DraftStatus,
  MessageDirection,
  MessageStatus,
  Prisma,
  TicketPriority,
  TicketStatus,
  nextEventSequence,
} from '@agentic-support/db';
import { getCorrelationContext } from '@agentic-support/observability';
import { ActorType } from '../auth/actor-type.constants';
import { MetricsService } from '../observability/metrics.service';
import { PrismaService } from '../prisma/prisma.service';

const ticketListInclude = {
  messages: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: { body: true, createdAt: true },
  },
  events: {
    orderBy: [{ sequence: 'desc' as const }, { createdAt: 'desc' as const }],
    take: 1,
    select: { type: true, createdAt: true },
  },
} satisfies Prisma.TicketInclude;

const ticketDetailInclude = {
  messages: {
    orderBy: { createdAt: 'asc' as const },
  },
  agentRuns: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    include: {
      steps: {
        orderBy: { createdAt: 'asc' as const },
      },
    },
  },
  events: {
    orderBy: [{ sequence: 'asc' as const }, { createdAt: 'asc' as const }],
  },
  drafts: {
    orderBy: { createdAt: 'desc' as const },
    include: {
      approvals: {
        orderBy: { createdAt: 'desc' as const },
      },
    },
  },
} satisfies Prisma.TicketInclude;

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService = {
      incrementDraftCreated: () => undefined,
      incrementDraftSent: () => undefined,
    } as unknown as MetricsService,
  ) {}

  async getOrganizationById(orgId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return organization;
  }

  async getTicketOrThrow(ticketId: string, orgId: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, orgId },
      include: ticketDetailInclude,
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    return ticket;
  }

  async assertTicketAccess(ticketId: string, orgId: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, orgId },
      select: { id: true, orgId: true },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    return { ticket };
  }

  async listTickets(orgId: string) {
    const tickets = await this.prisma.ticket.findMany({
      where: { orgId },
      include: ticketListInclude,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return tickets.map((ticket) => ({
      id: ticket.id,
      subject: ticket.subject,
      customerEmail: ticket.customerEmail,
      customerName: ticket.customerName,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      latestMessagePreview: this.truncate(ticket.messages[0]?.body ?? null),
      latestTimelineEvent: ticket.events[0]
        ? {
            type: ticket.events[0].type,
            createdAt: ticket.events[0].createdAt,
          }
        : null,
    }));
  }

  async getTicketDetail(ticketId: string, orgId: string) {
    const ticket = await this.getTicketOrThrow(ticketId, orgId);
    const latestAgentRun = ticket.agentRuns[0] ?? null;

    return {
      id: ticket.id,
      orgId: ticket.orgId,
      subject: ticket.subject,
      customerEmail: ticket.customerEmail,
      customerName: ticket.customerName,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      messages: ticket.messages,
      latestAgentRun,
      drafts: ticket.drafts.map((draft) => ({
        ...draft,
        approvals: draft.approvals,
      })),
      agentSteps: latestAgentRun?.steps ?? [],
      timeline: ticket.events.map((event) => ({
        id: event.id,
        runId: event.runId,
        type: event.type,
        sequence: event.sequence,
        payload: event.payload,
        createdAt: event.createdAt,
      })),
    };
  }

  async updateTicketStatus(
    ticketId: string,
    orgId: string,
    status: TicketStatus,
  ) {
    await this.assertTicketAccess(ticketId, orgId);

    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.update({
        where: { id: ticketId },
        data: { status },
      });
      const sequence = await nextEventSequence(tx, orgId, ticketId);

      await tx.agentEvent.create({
        data: {
          orgId,
          ticketId,
          correlationId: getCorrelationContext()?.correlationId ?? null,
          type: AgentEventType.TICKET_STATUS_CHANGED,
          sequence,
          payload: { status },
        },
      });

      return ticket;
    });
  }

  async updateTicketPriority(
    ticketId: string,
    orgId: string,
    priority: TicketPriority,
  ) {
    await this.assertTicketAccess(ticketId, orgId);

    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.update({
        where: { id: ticketId },
        data: { priority },
      });
      const sequence = await nextEventSequence(tx, orgId, ticketId);

      await tx.agentEvent.create({
        data: {
          orgId,
          ticketId,
          correlationId: getCorrelationContext()?.correlationId ?? null,
          type: AgentEventType.TICKET_PRIORITY_CHANGED,
          sequence,
          payload: { priority },
        },
      });

      return ticket;
    });
  }

  async getApprovalOrThrow(approvalId: string, orgId: string) {
    const approval = await this.prisma.humanApproval.findFirst({
      where: {
        id: approvalId,
        orgId,
      },
    });

    if (!approval) {
      throw new NotFoundException('Approval not found');
    }

    return { approval };
  }

  async getDraftOrThrow(draftId: string, orgId: string) {
    const draft = await this.prisma.outboundDraft.findFirst({
      where: {
        id: draftId,
        orgId,
      },
      include: {
        approvals: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!draft) {
      throw new NotFoundException('Draft not found');
    }

    return { draft };
  }

  async listDrafts(ticketId: string, orgId: string) {
    await this.assertTicketAccess(ticketId, orgId);

    return this.prisma.outboundDraft.findMany({
      where: {
        orgId,
        ticketId,
      },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        approvals: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async getDraftDetail(draftId: string, orgId: string) {
    const { draft } = await this.getDraftOrThrow(draftId, orgId);

    return draft;
  }

  async getTimeline(ticketId: string, orgId: string) {
    await this.assertTicketAccess(ticketId, orgId);
    const events = await this.prisma.agentEvent.findMany({
      where: { orgId, ticketId },
      orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }],
    });

    return events.map((event) => ({
      id: event.id,
      runId: event.runId,
      sequence: event.sequence,
      ts: event.createdAt.toISOString(),
      type: event.type,
      payload: event.payload,
    }));
  }

  async getAgentSteps(ticketId: string, orgId: string) {
    const ticket = await this.getTicketOrThrow(ticketId, orgId);
    const latestRun = ticket.agentRuns[0];

    if (!latestRun) {
      return [];
    }

    return this.prisma.agentStep.findMany({
      where: {
        orgId: ticket.orgId,
        agentRunId: latestRun.id,
      },
      orderBy: [{ createdAt: 'asc' }],
    });
  }

  async getRetrievals(ticketId: string, orgId: string) {
    await this.assertTicketAccess(ticketId, orgId);

    return this.prisma.knowledgeRetrieval.findMany({
      where: {
        orgId,
        ticketId,
      },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async getOrCreateOrganizationSettings(orgId: string) {
    return this.prisma.organizationSettings.upsert({
      where: { orgId },
      update: {},
      create: { orgId },
    });
  }

  async appendTimelineEvent(
    tx: Prisma.TransactionClient,
    orgId: string,
    ticketId: string,
    type: AgentEventType,
    payload: Prisma.InputJsonValue,
    runId?: string,
  ) {
    const sequence = await nextEventSequence(tx, orgId, ticketId);

    return tx.agentEvent.create({
      data: {
        orgId,
        ticketId,
        runId,
        correlationId: getCorrelationContext()?.correlationId ?? null,
        type,
        sequence,
        payload,
      },
    });
  }

  async createManualDraft(
    ticketId: string,
    orgId: string,
    body: string,
    actorUserId: string,
  ) {
    await this.assertTicketAccess(ticketId, orgId);

    return this.prisma.$transaction(async (tx) => {
      const draft = await tx.outboundDraft.create({
        data: {
          orgId,
          ticketId,
          body,
          status: DraftStatus.DRAFT,
          createdBy: this.toUserActor(actorUserId),
          createdByType: ActorType.USER,
          createdByUserId: actorUserId,
        },
      });

      await this.appendTimelineEvent(
        tx,
        orgId,
        ticketId,
        AgentEventType.DRAFT_CREATED,
        {
          draftId: draft.id,
          status: DraftStatus.DRAFT,
          actorType: ActorType.USER,
          actorUserId,
        },
      );

      this.metrics.incrementDraftCreated('user');

      return draft;
    });
  }

  async editDraft(draftId: string, orgId: string, body: string) {
    const { draft } = await this.getDraftOrThrow(draftId, orgId);

    if (draft.status === DraftStatus.SENT) {
      throw new BadRequestException('Sent drafts cannot be edited');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.outboundDraft.update({
        where: { id: draftId },
        data: { body },
      });

      await this.appendTimelineEvent(
        tx,
        orgId,
        draft.ticketId,
        AgentEventType.DRAFT_EDITED,
        { draftId, status: updated.status },
        draft.agentRunId ?? undefined,
      );

      return updated;
    });
  }

  async sendDraft(draftId: string, orgId: string, actorUserId: string) {
    const { draft } = await this.getDraftOrThrow(draftId, orgId);

    if (draft.status === DraftStatus.SENT) {
      throw new BadRequestException('Draft already sent');
    }

    const settings = await this.getOrCreateOrganizationSettings(orgId);
    if (
      settings.requireHumanApproval &&
      draft.status !== DraftStatus.APPROVED
    ) {
      throw new BadRequestException('Draft must be approved before sending');
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedDraft = await tx.outboundDraft.updateMany({
        where: {
          id: draftId,
          orgId,
          status: {
            not: DraftStatus.SENT,
          },
        },
        data: {
          status: DraftStatus.SENT,
          sentAt: new Date(),
          sentBy: this.toUserActor(actorUserId),
          sentByType: ActorType.USER,
          sentByUserId: actorUserId,
        },
      });

      if (updatedDraft.count !== 1) {
        throw new BadRequestException('Draft already sent');
      }

      const message = await tx.ticketMessage.create({
        data: {
          orgId,
          ticketId: draft.ticketId,
          body: draft.body,
          direction: MessageDirection.OUTBOUND,
          status: MessageStatus.SENT,
        },
      });

      const sentDraft = await tx.outboundDraft.findUniqueOrThrow({
        where: { id: draftId },
      });

      await tx.ticket.update({
        where: { id: draft.ticketId },
        data: { status: TicketStatus.WAITING_CUSTOMER },
      });

      await this.appendTimelineEvent(
        tx,
        orgId,
        draft.ticketId,
        AgentEventType.OUTBOUND_MESSAGE_CREATED,
        { draftId, messageId: message.id },
        draft.agentRunId ?? undefined,
      );
      await this.appendTimelineEvent(
        tx,
        orgId,
        draft.ticketId,
        AgentEventType.DRAFT_SENT,
        {
          draftId,
          status: DraftStatus.SENT,
          actorType: ActorType.USER,
          actorUserId,
        },
        draft.agentRunId ?? undefined,
      );

      this.metrics.incrementDraftSent('user');

      return { draft: sentDraft, message };
    });
  }

  private truncate(value?: string, maxLength = 140) {
    if (!value) {
      return null;
    }

    return value.length > maxLength
      ? `${value.slice(0, maxLength - 1)}...`
      : value;
  }

  private toUserActor(userId: string) {
    return `user:${userId}`;
  }
}
