import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { ApprovalsController } from './approvals.controller';

@Module({
  imports: [ChannelsModule],
  controllers: [ApprovalsController],
})
export class ApprovalsModule {}
