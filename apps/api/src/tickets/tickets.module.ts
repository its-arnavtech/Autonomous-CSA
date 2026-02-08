import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TicketsController } from './tickets.controller';
import { TicketsTimelineController } from './tickets.timeline.controller';

@Module({
  imports: [BullModule.registerQueue({ name: 'support' })],
  controllers: [TicketsController, TicketsTimelineController],
})
export class TicketsModule {}
