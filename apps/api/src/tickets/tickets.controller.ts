import { Body, Controller, Post } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';

type CreateTicketDto = {
  subject: string;
  body: string;
  customerEmail: string;
  orgId: string; // temporary until auth/multi-tenancy middleware exists
};

@Controller('tickets')
export class TicketsController {
  constructor(@InjectQueue('support') private readonly queue: Queue) {}

  @Post()
  async createTicket(@Body() dto: CreateTicketDto) {
    // later: validate DTO with zod + persist to Postgres
    const ticketId = randomUUID();

    const job = await this.queue.add('ticket.process', {
      orgId: dto.orgId,
      ticketId,
      subject: dto.subject,
      body: dto.body,
      customerEmail: dto.customerEmail,
    });

    return { ticketId, enqueuedJobId: job.id };
  }
}
