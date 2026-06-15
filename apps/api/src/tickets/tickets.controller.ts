import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import {
  AgentEventType,
  AgentRunStatus,
  AgentRunTrigger,
  MessageDirection,
  TicketPriority,
  TicketStatus,
  nextEventSequence,
} from '@agentic-support/db';
import { getCorrelationContext } from '@agentic-support/observability';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Queue } from 'bullmq';
import { ActorType } from '../auth/actor-type.constants';
import { CurrentOrganization } from '../auth/current-organization.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type {
  AuthenticatedUser,
  TenantMembership,
} from '../auth/authenticated-user.type';
import { JwtAccessGuard } from '../auth/jwt-access.guard';
import {
  MUTATING_ORG_ROLES,
  READ_ORG_ROLES,
} from '../auth/organization-role.constants';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import { PrismaService } from '../prisma/prisma.service';
import { SupportService } from '../support/support.service';
import { MetricsService } from '../observability/metrics.service';
import { SUPPORT_QUEUE_NAME } from '../queue/queue.config';
import {
  CreateTicketDto,
  UpdateTicketPriorityDto,
  UpdateTicketStatusDto,
} from './tickets.dto';
import { CreateDraftDto } from '../drafts/drafts.dto';

@ApiTags('tickets')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard, TenantContextGuard, RolesGuard)
@Controller('tickets')
export class TicketsController {
  constructor(
    @InjectQueue(SUPPORT_QUEUE_NAME) private readonly queue: Queue,
    private readonly prisma: PrismaService,
    private readonly supportService: SupportService,
    private readonly metrics: MetricsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List tickets for an organization inbox' })
  @Roles(...READ_ORG_ROLES)
  async listTickets(
    @CurrentOrganization() organization: TenantMembership,
  ) {
    return this.supportService.listTickets(organization.organizationId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get ticket detail, messages, latest run, and timeline',
  })
  @Roles(...READ_ORG_ROLES)
  async getTicket(
    @Param('id') ticketId: string,
    @CurrentOrganization() organization: TenantMembership,
  ) {
    return this.supportService.getTicketDetail(ticketId, organization.organizationId);
  }

  @Get(':id/approvals')
  @ApiOperation({ summary: 'List approvals for a ticket' })
  @Roles(...READ_ORG_ROLES)
  async getTicketApprovals(
    @Param('id') ticketId: string,
    @CurrentOrganization() organization: TenantMembership,
  ) {
    await this.supportService.assertTicketAccess(
      ticketId,
      organization.organizationId,
    );

    return this.prisma.humanApproval.findMany({
      where: {
        orgId: organization.organizationId,
        ticketId,
      },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        outboundDraft: true,
      },
    });
  }

  @Get(':id/drafts')
  @ApiOperation({ summary: 'List drafts for a ticket' })
  @Roles(...READ_ORG_ROLES)
  async getTicketDrafts(
    @Param('id') ticketId: string,
    @CurrentOrganization() organization: TenantMembership,
  ) {
    return this.supportService.listDrafts(ticketId, organization.organizationId);
  }

  @Get(':id/agent-steps')
  @ApiOperation({
    summary: 'List agent runtime steps for the latest run on a ticket',
  })
  @Roles(...READ_ORG_ROLES)
  async getTicketAgentSteps(
    @Param('id') ticketId: string,
    @CurrentOrganization() organization: TenantMembership,
  ) {
    return this.supportService.getAgentSteps(ticketId, organization.organizationId);
  }

  @Get(':id/guardrails')
  @ApiOperation({ summary: 'List guardrail checks for a ticket' })
  @Roles(...READ_ORG_ROLES)
  async getTicketGuardrails(
    @Param('id') ticketId: string,
    @CurrentOrganization() organization: TenantMembership,
  ) {
    await this.supportService.assertTicketAccess(
      ticketId,
      organization.organizationId,
    );

    return this.prisma.agentGuardrailCheck.findMany({
      where: { orgId: organization.organizationId, ticketId },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  @Get(':id/retrievals')
  @ApiOperation({
    summary: 'List knowledge retrieval traces for a ticket',
  })
  @Roles(...READ_ORG_ROLES)
  async getTicketRetrievals(
    @Param('id') ticketId: string,
    @CurrentOrganization() organization: TenantMembership,
  ) {
    return this.supportService.getRetrievals(ticketId, organization.organizationId);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a ticket and enqueue the support worker job',
  })
  @Roles(...MUTATING_ORG_ROLES)
  async createTicket(
    @Body() dto: CreateTicketDto,
    @CurrentOrganization() organization: TenantMembership,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const priority = dto.priority ?? TicketPriority.NORMAL;
    const correlationId = getCorrelationContext()?.correlationId ?? null;
    const queuedAt = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.create({
        data: {
          orgId: organization.organizationId,
          subject: dto.subject,
          status: TicketStatus.OPEN,
          priority,
          customerEmail: dto.customerEmail,
          customerName: dto.customerName,
          messages: {
            create: {
              orgId: organization.organizationId,
              direction: MessageDirection.INBOUND,
              body: dto.body,
            },
          },
        },
      });

      const run = await tx.agentRun.create({
        data: {
          orgId: organization.organizationId,
          ticketId: ticket.id,
          correlationId,
          status: AgentRunStatus.QUEUED,
          trigger: AgentRunTrigger.TICKET_CREATED,
          queuedAt,
        },
      });

      const sequence = await nextEventSequence(
        tx,
        organization.organizationId,
        ticket.id,
      );

      await tx.agentEvent.create({
        data: {
          orgId: organization.organizationId,
          ticketId: ticket.id,
          runId: run.id,
          correlationId,
          type: AgentEventType.RUN_QUEUED,
          sequence,
          payload: {
            subject: dto.subject,
            actorType: ActorType.USER,
            actorUserId: user.userId,
            correlationId,
          },
        },
      });

      return { ticket, run };
    });

    const job = await this.queue.add(
      'ticket.process',
      {
        orgId: organization.organizationId,
        orgSlug: organization.organizationSlug,
        runId: result.run.id,
        ticketId: result.ticket.id,
        subject: dto.subject,
        body: dto.body,
        customerEmail: dto.customerEmail,
        requestedByUserId: user.userId,
        correlationId,
        triggerType: AgentRunTrigger.TICKET_CREATED,
        enqueuedAt: queuedAt.toISOString(),
      },
      {
        jobId: `support-${result.run.id}`,
      },
    );

    this.metrics.incrementQueueEnqueued(
      'ticket.process',
      AgentRunTrigger.TICKET_CREATED,
    );
    this.metrics.incrementAgentRun('queued', 'ticket_created');

    return { ticketId: result.ticket.id, enqueuedJobId: job.id };
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update a ticket status' })
  @Roles(...MUTATING_ORG_ROLES)
  async updateTicketStatus(
    @Param('id') ticketId: string,
    @Body() dto: UpdateTicketStatusDto,
    @CurrentOrganization() organization: TenantMembership,
  ) {
    return this.supportService.updateTicketStatus(
      ticketId,
      organization.organizationId,
      dto.status,
    );
  }

  @Patch(':id/priority')
  @ApiOperation({ summary: 'Update a ticket priority' })
  @Roles(...MUTATING_ORG_ROLES)
  async updateTicketPriority(
    @Param('id') ticketId: string,
    @Body() dto: UpdateTicketPriorityDto,
    @CurrentOrganization() organization: TenantMembership,
  ) {
    return this.supportService.updateTicketPriority(
      ticketId,
      organization.organizationId,
      dto.priority,
    );
  }

  @Post(':id/drafts')
  @ApiOperation({ summary: 'Create a manual outbound draft for a ticket' })
  @Roles(...MUTATING_ORG_ROLES)
  async createTicketDraft(
    @Param('id') ticketId: string,
    @Body() dto: CreateDraftDto,
    @CurrentOrganization() organization: TenantMembership,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.supportService.createManualDraft(
      ticketId,
      organization.organizationId,
      dto.body,
      user.userId,
    );
  }
}
