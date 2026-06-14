import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { SupportService } from '../support/support.service';
import {
  CreateTicketDto,
  OrgQueryDto,
  UpdateTicketPriorityDto,
  UpdateTicketStatusDto,
} from './tickets.dto';
import { CreateDraftDto } from '../drafts/drafts.dto';

@ApiTags('tickets')
@Controller('tickets')
export class TicketsController {
  constructor(
    @InjectQueue('support') private readonly queue: Queue,
    private readonly prisma: PrismaService,
    private readonly supportService: SupportService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List tickets for an organization inbox' })
  async listTickets(@Query() query: OrgQueryDto) {
    return this.supportService.listTickets(query.orgId ?? 'org_demo');
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get ticket detail, messages, latest run, and timeline',
  })
  async getTicket(@Param('id') ticketId: string, @Query() query: OrgQueryDto) {
    return this.supportService.getTicketDetail(
      ticketId,
      query.orgId ?? 'org_demo',
    );
  }

  @Get(':id/approvals')
  @ApiOperation({ summary: 'List approvals for a ticket' })
  async getTicketApprovals(
    @Param('id') ticketId: string,
    @Query() query: OrgQueryDto,
  ) {
    const { organization } = await this.supportService.assertTicketAccess(
      ticketId,
      query.orgId ?? 'org_demo',
    );

    return this.prisma.humanApproval.findMany({
      where: {
        orgId: organization.id,
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
  async getTicketDrafts(
    @Param('id') ticketId: string,
    @Query() query: OrgQueryDto,
  ) {
    return this.supportService.listDrafts(ticketId, query.orgId ?? 'org_demo');
  }

  @Get(':id/agent-steps')
  @ApiOperation({
    summary: 'List agent runtime steps for the latest run on a ticket',
  })
  async getTicketAgentSteps(
    @Param('id') ticketId: string,
    @Query() query: OrgQueryDto,
  ) {
    return this.supportService.getAgentSteps(
      ticketId,
      query.orgId ?? 'org_demo',
    );
  }

  @Get(':id/guardrails')
  @ApiOperation({ summary: 'List guardrail checks for a ticket' })
  async getTicketGuardrails(
    @Param('id') ticketId: string,
    @Query() query: OrgQueryDto,
  ) {
    const { organization } = await this.supportService.assertTicketAccess(
      ticketId,
      query.orgId ?? 'org_demo',
    );

    return this.prisma.agentGuardrailCheck.findMany({
      where: { orgId: organization.id, ticketId },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  @Get(':id/retrievals')
  @ApiOperation({
    summary: 'List knowledge retrieval traces for a ticket',
  })
  async getTicketRetrievals(
    @Param('id') ticketId: string,
    @Query() query: OrgQueryDto,
  ) {
    return this.supportService.getRetrievals(
      ticketId,
      query.orgId ?? 'org_demo',
    );
  }

  @Post()
  @ApiOperation({
    summary: 'Create a ticket and enqueue the support worker job',
  })
  async createTicket(@Body() dto: CreateTicketDto) {
    const orgSlug = dto.orgId ?? 'org_demo';
    const organization = await this.supportService.resolveOrganization(orgSlug);
    const priority = dto.priority ?? TicketPriority.NORMAL;

    const result = await this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.create({
        data: {
          orgId: organization.id,
          subject: dto.subject,
          status: TicketStatus.OPEN,
          priority,
          customerEmail: dto.customerEmail,
          customerName: dto.customerName,
          messages: {
            create: {
              orgId: organization.id,
              direction: MessageDirection.INBOUND,
              body: dto.body,
            },
          },
        },
      });

      const run = await tx.agentRun.create({
        data: {
          orgId: organization.id,
          ticketId: ticket.id,
          status: AgentRunStatus.QUEUED,
          trigger: AgentRunTrigger.TICKET_CREATED,
        },
      });

      const sequence = await nextEventSequence(tx, organization.id, ticket.id);

      await tx.agentEvent.create({
        data: {
          orgId: organization.id,
          ticketId: ticket.id,
          runId: run.id,
          type: AgentEventType.RUN_QUEUED,
          sequence,
          payload: { subject: dto.subject },
        },
      });

      return { ticket, run };
    });

    const job = await this.queue.add('ticket.process', {
      orgId: organization.id,
      orgSlug,
      runId: result.run.id,
      ticketId: result.ticket.id,
      subject: dto.subject,
      body: dto.body,
      customerEmail: dto.customerEmail,
    });

    return { ticketId: result.ticket.id, enqueuedJobId: job.id };
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update a ticket status' })
  async updateTicketStatus(
    @Param('id') ticketId: string,
    @Body() dto: UpdateTicketStatusDto,
  ) {
    return this.supportService.updateTicketStatus(
      ticketId,
      dto.orgId,
      dto.status,
    );
  }

  @Patch(':id/priority')
  @ApiOperation({ summary: 'Update a ticket priority' })
  async updateTicketPriority(
    @Param('id') ticketId: string,
    @Body() dto: UpdateTicketPriorityDto,
  ) {
    return this.supportService.updateTicketPriority(
      ticketId,
      dto.orgId,
      dto.priority,
    );
  }

  @Post(':id/drafts')
  @ApiOperation({ summary: 'Create a manual outbound draft for a ticket' })
  async createTicketDraft(
    @Param('id') ticketId: string,
    @Body() dto: CreateDraftDto,
  ) {
    return this.supportService.createManualDraft(ticketId, dto.orgId, dto.body);
  }
}
