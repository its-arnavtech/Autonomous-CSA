import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';
import { SUPPORT_QUEUE_NAME } from '../queue/queue.config';

@Module({
  imports: [BullModule.registerQueue({ name: SUPPORT_QUEUE_NAME })],
  controllers: [OperationsController],
  providers: [OperationsService],
})
export class OperationsModule {}
