import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { ObservabilityModule } from '../observability/observability.module';
import { ChannelTicketController } from './channel-ticket.controller';
import { ChannelWebhooksController } from './channel-webhooks.controller';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { InboundDispatchReconcilerService } from './inbound-dispatch-reconciler.service';
import { OutboundMessagesController } from './outbound-messages.controller';

@Module({
  imports: [PrismaModule, QueueModule, ObservabilityModule],
  controllers: [
    ChannelsController,
    ChannelWebhooksController,
    ChannelTicketController,
    OutboundMessagesController,
  ],
  providers: [ChannelsService, InboundDispatchReconcilerService],
  exports: [ChannelsService],
})
export class ChannelsModule {}
