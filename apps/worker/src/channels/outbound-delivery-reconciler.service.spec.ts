import { OutboundMessageStatus } from '@agentic-support/db';
import { OutboundDeliveryReconcilerService } from './outbound-delivery-reconciler.service';

function createService() {
  const prisma = {
    outboundMessage: {
      findMany: jest.fn(),
    },
  };
  const deliveryQueue = {
    add: jest.fn(),
  };

  return {
    prisma,
    deliveryQueue,
    service: new OutboundDeliveryReconcilerService(
      prisma as never,
      deliveryQueue as never,
    ),
  };
}

describe('OutboundDeliveryReconcilerService', () => {
  it('enqueues pending outbound messages with deterministic job ids', async () => {
    const { prisma, deliveryQueue, service } = createService();
    prisma.outboundMessage.findMany.mockResolvedValue([
      { id: 'outbound_1', status: OutboundMessageStatus.PENDING, attemptCount: 2 },
    ]);
    deliveryQueue.add.mockResolvedValue({ id: 'channel-delivery-outbound_1-2' });

    await expect(service.reconcile()).resolves.toEqual({ enqueued: 1 });
    expect(deliveryQueue.add).toHaveBeenCalledWith(
      'send-outbound-message',
      { outboundMessageId: 'outbound_1' },
      { jobId: 'channel-delivery-outbound_1-2' },
    );
  });

  it('contains Redis enqueue failures so later reconciliation can retry', async () => {
    const { prisma, deliveryQueue, service } = createService();
    prisma.outboundMessage.findMany.mockResolvedValue([{ id: 'outbound_1' }]);
    deliveryQueue.add.mockRejectedValue(new Error('Redis unavailable'));

    await expect(service.reconcile()).resolves.toEqual({ enqueued: 0 });
  });
});
