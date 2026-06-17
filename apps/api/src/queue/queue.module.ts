import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueController } from './queue.controller';
import {
  getQueueConnection,
  getQueueDefaults,
  CHANNEL_DELIVERY_QUEUE_NAME,
  SUPPORT_DEAD_LETTER_QUEUE_NAME,
  SUPPORT_QUEUE_NAME,
} from './queue.config';
import { QueueLifecycleService } from './queue-lifecycle.service';

const queueDefaults = getQueueDefaults();

@Module({
  imports: [
    BullModule.forRoot({
      connection: getQueueConnection(),
      defaultJobOptions: {
        attempts: queueDefaults.attempts,
        backoff: {
          type: 'exponential',
          delay: queueDefaults.backoffBaseMs,
        },
        removeOnComplete: {
          count: queueDefaults.removeOnCompleteCount,
        },
        removeOnFail: {
          count: queueDefaults.removeOnFailCount,
        },
      },
    }),
    BullModule.registerQueue({ name: SUPPORT_QUEUE_NAME }),
    BullModule.registerQueue({ name: SUPPORT_DEAD_LETTER_QUEUE_NAME }),
    BullModule.registerQueue({ name: CHANNEL_DELIVERY_QUEUE_NAME }),
  ],
  controllers: [QueueController],
  providers: [QueueLifecycleService],
  exports: [BullModule],
})
export class QueueModule {}
