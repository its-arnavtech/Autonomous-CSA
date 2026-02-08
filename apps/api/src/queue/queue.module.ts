import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueController } from './queue.controller';

const redisHost = process.env.REDIS_HOST ?? 'localhost';
const redisPort = process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379;

@Module({
  imports: [
    BullModule.forRoot({
      connection: { host: redisHost, port: redisPort },
    }),
    BullModule.registerQueue({ name: 'support' }),
  ],
  controllers: [QueueController],
})
export class QueueModule {}
