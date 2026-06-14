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
  constructor(private readonly prisma: PrismaService) {}

  async resolveOrganization(orgSlug = 'org_demo') {
    const organization = await this.prisma.organization.findUnique({
      where: { slug: orgSlug },
    });

    if (!organization) {
      throw new BadRequestException(`Unknown organization: ${orgSlug}`);
    }

    return organization;
  }

  async getTicketOrThrow(ticketId: string, orgSlug = 'org_demo') {
    const organization = await this.resolveOrganization(orgSlug);
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, orgId: organization.id },
      include: ticketDetailInclude,
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    return ticket;
  }

  async assertTicketAccess(ticketId: string, orgSlug = 'org_demo') {
    const organization = await this.resolveOrganization(orgSlug);
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, orgId: organization.id },
      select: { id: true, orgId: true },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    return { organization, ticket };
  }

  async listTickets(orgSlug = 'org_demo') {
    const organization = await this.resolveOrganization(orgSlug);
    const tickets = await this.prisma.ticket.findMany({
      where: { orgId: organization.id },
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
      latestMessagePreview: this.truncate(ticket.messages[0]?.body),
      latestTimelineEvent: ticket.events[0]
        ? {
            type: ticket.events[0].type,
            createdAt: ticket.events[0].createdAt,
          }
        : null,
    }));
  }

  async getTicketDetail(ticketId: string, orgSlug = 'org_demo') {
    const ticket = await this.getTicketOrThrow(ticketId, orgSlug);
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
      drafts: ticket.drafts,
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
    orgSlug: string,
    status: TicketStatus,
  ) {
    const { organization } = await this.assertTicketAccess(ticketId, orgSlug);

    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.update({
        where: { id: ticketId },
        data: { status },
      });
      const sequence = await nextEventSequence(tx, organization.id, ticketId);

      await tx.agentEvent.create({
        data: {
          orgId: organization.id,
          ticketId,
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
    orgSlug: string,
    priority: TicketPriority,
  ) {
    const { organization } = await this.assertTicketAccess(ticketId, orgSlug);

    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.update({
        where: { id: ticketId },
        data: { priority },
      });
      const sequence = await nextEventSequence(tx, organization.id, ticketId);

      await tx.agentEvent.create({
        data: {
          orgId: organization.id,
          ticketId,
          type: AgentEventType.TICKET_PRIORITY_CHANGED,
          sequence,
          payload: { priority },
        },
      });

      return ticket;
    });
  }

  async getApprovalOrThrow(approvalId: string, orgSlug: string) {
    const organization = await this.resolveOrganization(orgSlug);
    const approval = await this.prisma.humanApproval.findFirst({
      where: {
        id: approvalId,
        orgId: organization.id,
      },
    });

    if (!approval) {
      throw new NotFoundException('Approval not found');
    }

    return { organization, approval };
  }

  async getDraftOrThrow(draftId: string, orgSlug: string) {
    const organization = await this.resolveOrganization(orgSlug);
    const draft = await this.prisma.outboundDraft.findFirst({
      where: {
        id: draftId,
        orgId: organization.id,
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

    return { organization, draft };
  }

  async listDrafts(ticketId: string, orgSlug = 'org_demo') {
    const { organization } = await this.assertTicketAccess(ticketId, orgSlug);

    return this.prisma.outboundDraft.findMany({
      where: {
        orgId: organization.id,
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

  async getDraftDetail(draftId: string, orgSlug = 'org_demo') {
    const { draft } = await this.getDraftOrThrow(draftId, orgSlug);

    return draft;
  }

  async getTimeline(ticketId: string, orgSlug = 'org_demo') {
    const { organization } = await this.assertTicketAccess(ticketId, orgSlug);
    const events = await this.prisma.agentEvent.findMany({
      where: { orgId: organization.id, ticketId },
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

  async getAgentSteps(ticketId: string, orgSlug = 'org_demo') {
    const ticket = await this.getTicketOrThrow(ticketId, orgSlug);
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

  async getRetrievals(ticketId: string, orgSlug = 'org_demo') {
    const { organization } = await this.assertTicketAccess(ticketId, orgSlug);

    return this.prisma.knowledgeRetrieval.findMany({
      where: {
        orgId: organization.id,
        ticketId,
      },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async getOrCreateOrganizationSettings(orgSlug: string) {
    const organization = await this.resolveOrganization(orgSlug);

    return this.prisma.organizationSettings.upsert({
      where: { orgId: organization.id },
      update: {},
      create: { orgId: organization.id },
    });
  }

  async getOrCreateOrganizationSettingsById(orgId: string) {
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
        type,
        sequence,
        payload,
      },
    });
  }

  async createManualDraft(ticketId: string, orgSlug: string, body: string) {
    const { organization } = await this.assertTicketAccess(ticketId, orgSlug);

    return this.prisma.$transaction(async (tx) => {
      const draft = await tx.outboundDraft.create({
        data: {
          orgId: organization.id,
          ticketId,
          body,
          status: DraftStatus.DRAFT,
          createdBy: 'human_stub',
        },
      });

      await this.appendTimelineEvent(
        tx,
        organization.id,
        ticketId,
        AgentEventType.DRAFT_CREATED,
        { draftId: draft.id, status: DraftStatus.DRAFT },
      );

      return draft;
    });
  }

  async editDraft(draftId: string, orgSlug: string, body: string) {
    const { organization, draft } = await this.getDraftOrThrow(
      draftId,
      orgSlug,
    );

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
        organization.id,
        draft.ticketId,
        AgentEventType.DRAFT_EDITED,
        { draftId, status: updated.status },
        draft.agentRunId ?? undefined,
      );

      return updated;
    });
  }

  async sendDraft(draftId: string, orgSlug: string) {
    const { organization, draft } = await this.getDraftOrThrow(
      draftId,
      orgSlug,
    );

    if (draft.status === DraftStatus.SENT) {
      throw new BadRequestException('Draft already sent');
    }

    const settings = await this.getOrCreateOrganizationSettings(orgSlug);
    if (
      settings.requireHumanApproval &&
      draft.status !== DraftStatus.APPROVED
    ) {
      throw new BadRequestException('Draft must be approved before sending');
    }

    return this.prisma.$transaction(async (tx) => {
      const message = await tx.ticketMessage.create({
        data: {
          orgId: organization.id,
          ticketId: draft.ticketId,
          body: draft.body,
          direction: MessageDirection.OUTBOUND,
          status: MessageStatus.SENT,
        },
      });

      const updatedDraft = await tx.outboundDraft.update({
        where: { id: draftId },
        data: {
          status: DraftStatus.SENT,
          sentAt: new Date(),
        },
      });

      await tx.ticket.update({
        where: { id: draft.ticketId },
        data: { status: TicketStatus.WAITING_CUSTOMER },
      });

      await this.appendTimelineEvent(
        tx,
        organization.id,
        draft.ticketId,
        AgentEventType.OUTBOUND_MESSAGE_CREATED,
        { draftId, messageId: message.id },
        draft.agentRunId ?? undefined,
      );
      await this.appendTimelineEvent(
        tx,
        organization.id,
        draft.ticketId,
        AgentEventType.DRAFT_SENT,
        { draftId, status: DraftStatus.SENT },
        draft.agentRunId ?? undefined,
      );

      return { draft: updatedDraft, message };
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
}
