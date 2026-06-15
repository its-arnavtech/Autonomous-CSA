import {
  AgentRunTrigger,
  TicketPriority,
  TicketStatus,
} from '@agentic-support/db';
import { runWithCorrelationContext } from '@agentic-support/observability';
import { TicketsController } from './tickets.controller';

describe('Phase 9 ticket enqueue correlation', () => {
  it('includes correlation IDs in queued runs, events, and job payloads', async () => {
    const tx = {
      ticket: {
        create: jest.fn().mockResolvedValue({
          id: 'ticket_1',
          status: TicketStatus.OPEN,
        }),
      },
      agentRun: {
        create: jest.fn().mockResolvedValue({
          id: 'run_1',
        }),
      },
      agentEvent: {
        aggregate: jest.fn().mockResolvedValue({ _max: { sequence: 0 } }),
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const prisma = {
      $transaction: jest.fn().mockImplementation(async (callback: any) => callback(tx)),
    };
    const queue = {
      add: jest.fn().mockResolvedValue({ id: 'support-run_1' }),
    };
    const supportService = {};
    const metrics = {
      incrementQueueEnqueued: jest.fn(),
      incrementAgentRun: jest.fn(),
    };

    const controller = new TicketsController(
      queue as never,
      prisma as never,
      supportService as never,
      metrics as never,
    );

    const result = await runWithCorrelationContext(
      { correlationId: 'phase9-ticket-correlation-1234' },
      () =>
        controller.createTicket(
          {
            subject: 'Billing issue',
            body: 'Customer reported double charge.',
            customerEmail: 'customer@example.com',
            priority: TicketPriority.NORMAL,
          },
          {
            organizationId: 'org_1',
            organizationSlug: 'acme',
            organizationName: 'Acme',
            role: 'OWNER',
            membershipId: 'membership_1',
          },
          {
            userId: 'user_1',
            email: 'owner@example.com',
          },
        ),
    );

    expect(result).toEqual({
      ticketId: 'ticket_1',
      enqueuedJobId: 'support-run_1',
    });
    expect(tx.agentRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          correlationId: 'phase9-ticket-correlation-1234',
          trigger: AgentRunTrigger.TICKET_CREATED,
        }),
      }),
    );
    expect(tx.agentEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          correlationId: 'phase9-ticket-correlation-1234',
        }),
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'ticket.process',
      expect.objectContaining({
        correlationId: 'phase9-ticket-correlation-1234',
      }),
      expect.any(Object),
    );
  });
});
