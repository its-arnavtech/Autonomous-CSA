import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  AgentEventType,
  AgentRunStatus,
  AgentRunTrigger,
  MessageDirection,
  TicketPriority,
  TicketStatus,
} from '@agentic-support/db';
import { PrismaService } from '../prisma/prisma.service';

type CreateTicketDto = {
  subject: string;
  body: string;
  customerEmail: string;
  customerName?: string;
  orgId?: string; // temporary org slug until auth/multi-tenancy middleware exists
  priority?: TicketPriority;
};

@Controller('tickets')
export class TicketsController {
  constructor(
    @InjectQueue('support') private readonly queue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async listTickets(@Query('orgId') orgSlug = 'org_demo') {
    const organization = await this.resolveOrganization(orgSlug);

    return this.prisma.ticket.findMany({
      where: { orgId: organization.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        subject: true,
        status: true,
        priority: true,
        customerEmail: true,
        customerName: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  @Get(':id')
  async getTicket(@Param('id') ticketId: string, @Query('orgId') orgSlug = 'org_demo') {
    const organization = await this.resolveOrganization(orgSlug);
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, orgId: organization.id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    return ticket;
  }

  @Post()
  async createTicket(@Body() dto: CreateTicketDto) {
    if (!dto.subject || !dto.body || !dto.customerEmail) {
      throw new BadRequestException('subject, body, and customerEmail are required');
    }

    const orgSlug = dto.orgId ?? 'org_demo';
    const organization = await this.resolveOrganization(orgSlug);
    const priority = dto.priority ?? TicketPriority.MEDIUM;

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

      await tx.agentEvent.create({
        data: {
          orgId: organization.id,
          ticketId: ticket.id,
          runId: run.id,
          type: AgentEventType.RUN_QUEUED,
          sequence: 1,
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

  private async resolveOrganization(orgSlug: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { slug: orgSlug },
    });

    if (!organization) {
      throw new BadRequestException(`Unknown organization: ${orgSlug}`);
    }

    return organization;
  }
}
