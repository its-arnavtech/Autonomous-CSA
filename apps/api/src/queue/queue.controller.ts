import { Controller, Post } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Controller('debug/queue')
export class QueueController {
  constructor(@InjectQueue('support') private readonly queue: Queue) {}

  @Post('hello')
  async enqueueHello() {
    const job = await this.queue.add('hello', { msg: 'hello from api' });
    return { enqueued: true, jobId: job.id };
  }
}
