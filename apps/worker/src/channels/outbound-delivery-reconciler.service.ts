import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { OutboundMessageStatus } from '@agentic-support/db';
import { PrismaService } from '../prisma.service';
import { CHANNEL_DELIVERY_QUEUE_NAME } from '../queue/queue.config';

const RECONCILE_INTERVAL_MS = Math.max(
  Number.parseInt(
    process.env.CHANNEL_OUTBOUND_DELIVERY_RECONCILE_INTERVAL_MS ?? '30000',
    10,
  ),
  5000,
);

@Injectable()
export class OutboundDeliveryReconcilerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(OutboundDeliveryReconcilerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(CHANNEL_DELIVERY_QUEUE_NAME)
    private readonly deliveryQueue: Queue,
  ) {}

  onModuleInit() {
    void this.reconcile();
    this.timer = setInterval(() => void this.reconcile(), RECONCILE_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async reconcile(limit = 50) {
    if (this.running) {
      return { enqueued: 0, skipped: true };
    }

    this.running = true;
    try {
      const now = new Date();
      const candidates = await this.prisma.outboundMessage.findMany({
        where: {
          OR: [
            {
              status: {
                in: [
                  OutboundMessageStatus.PENDING,
                  OutboundMessageStatus.FAILED,
                  OutboundMessageStatus.RETRY_SCHEDULED,
                ],
              },
              OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
            },
            {
              status: OutboundMessageStatus.PROCESSING,
              leaseExpiresAt: { lt: now },
            },
          ],
        },
        orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
        take: limit,
        select: { id: true, attemptCount: true },
      });

      let enqueued = 0;
      for (const candidate of candidates) {
        try {
          await this.deliveryQueue.add(
            'send-outbound-message',
            { outboundMessageId: candidate.id },
            { jobId: `channel-delivery-${candidate.id}-${candidate.attemptCount}` },
          );
          enqueued += 1;
        } catch (error) {
          this.logger.warn('Failed to reconcile outbound delivery job', {
            outboundMessageId: candidate.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (enqueued > 0) {
        this.logger.log('Reconciled outbound delivery jobs', { enqueued });
      }
      return { enqueued };
    } finally {
      this.running = false;
    }
  }
}
