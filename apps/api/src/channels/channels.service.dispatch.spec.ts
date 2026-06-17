import { InboundDispatchStatus } from '@agentic-support/db';
import { ChannelsService } from './channels.service';

function createService() {
  const prisma = {
    inboundDispatch: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const supportQueue = {
    add: jest.fn(),
  };
  const deliveryQueue = {
    add: jest.fn(),
  };
  const metrics = {
    incrementChannelSignatureFailure: jest.fn(),
    incrementChannelWebhook: jest.fn(),
    incrementChannelDuplicateWebhook: jest.fn(),
    incrementChannelConversationCreated: jest.fn(),
    incrementChannelInboundMessage: jest.fn(),
    incrementChannelTicketCreated: jest.fn(),
    incrementChannelOutboundQueued: jest.fn(),
  };

  return {
    prisma,
    supportQueue,
    service: new ChannelsService(
      prisma as never,
      supportQueue as never,
      deliveryQueue as never,
      metrics as never,
    ),
  };
}

const dispatch = {
  id: 'dispatch_1',
  runId: 'run_1',
  status: InboundDispatchStatus.PENDING,
  payload: {
    orgId: 'org_1',
    runId: 'run_1',
    ticketId: 'ticket_1',
    subject: 'Subject',
    body: 'Body',
    customerEmail: 'customer@example.test',
    triggerType: 'TICKET_CREATED',
    enqueuedAt: '2026-06-16T00:00:00.000Z',
  },
};

describe('ChannelsService inbound dispatch reconciliation', () => {
  it('marks dispatch completed after a successful queue enqueue', async () => {
    const { prisma, supportQueue, service } = createService();
    prisma.inboundDispatch.findMany.mockResolvedValue([dispatch]);
    prisma.inboundDispatch.updateMany.mockResolvedValue({ count: 1 });
    prisma.inboundDispatch.findUnique.mockResolvedValue(dispatch);
    supportQueue.add.mockResolvedValue({ id: 'support-run_1' });
    prisma.inboundDispatch.update.mockResolvedValue({
      ...dispatch,
      status: InboundDispatchStatus.COMPLETED,
    });

    await expect(service.dispatchPendingInbound()).resolves.toEqual([
      {
        id: 'dispatch_1',
        status: InboundDispatchStatus.COMPLETED,
        jobId: 'support-run_1',
      },
    ]);
    expect(supportQueue.add).toHaveBeenCalledWith(
      'ticket.process',
      dispatch.payload,
      { jobId: 'support-run_1' },
    );
    expect(prisma.inboundDispatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: InboundDispatchStatus.COMPLETED,
          jobId: 'support-run_1',
        }),
      }),
    );
  });

  it('keeps dispatch pending when Redis enqueue fails', async () => {
    const { prisma, supportQueue, service } = createService();
    prisma.inboundDispatch.findMany.mockResolvedValue([dispatch]);
    prisma.inboundDispatch.updateMany.mockResolvedValue({ count: 1 });
    prisma.inboundDispatch.findUnique.mockResolvedValue(dispatch);
    supportQueue.add.mockRejectedValue(new Error('Redis unavailable'));
    prisma.inboundDispatch.update.mockResolvedValue({
      ...dispatch,
      status: InboundDispatchStatus.PENDING,
    });

    await expect(service.dispatchPendingInbound()).resolves.toEqual([
      {
        id: 'dispatch_1',
        status: InboundDispatchStatus.PENDING,
        errorCode: 'QUEUE_ENQUEUE_FAILED',
      },
    ]);
    expect(prisma.inboundDispatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: InboundDispatchStatus.PENDING,
          lastErrorCode: 'QUEUE_ENQUEUE_FAILED',
        }),
      }),
    );
  });

  it('does not enqueue when another reconciler already claimed the row', async () => {
    const { prisma, supportQueue, service } = createService();
    prisma.inboundDispatch.findMany.mockResolvedValue([dispatch]);
    prisma.inboundDispatch.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.dispatchPendingInbound()).resolves.toEqual([]);
    expect(supportQueue.add).not.toHaveBeenCalled();
  });
});
