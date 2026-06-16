import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  SUPPORT_DEAD_LETTER_QUEUE_NAME,
  SUPPORT_QUEUE_NAME,
} from './queue.config';

@Injectable()
export class QueueLifecycleService implements OnApplicationShutdown {
  constructor(
    @InjectQueue(SUPPORT_QUEUE_NAME)
    private readonly supportQueue: Queue,
    @InjectQueue(SUPPORT_DEAD_LETTER_QUEUE_NAME)
    private readonly deadLetterQueue: Queue,
  ) {}

  async onApplicationShutdown() {
    await Promise.allSettled([
      this.supportQueue.close(),
      this.deadLetterQueue.close(),
    ]);
  }
}
