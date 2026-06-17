import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ApprovalsModule } from './approvals/approvals.module';
import { AuthModule } from './auth/auth.module';
import { ChannelsModule } from './channels/channels.module';
import { DraftsModule } from './drafts/drafts.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { ObservabilityModule } from './observability/observability.module';
import { OperationsModule } from './operations/operations.module';
import { OrgsModule } from './orgs/orgs.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { SupportModule } from './support/support.module';
import { TicketsModule } from './tickets/tickets.module';

@Module({
  imports: [
    PrismaModule,
    SupportModule,
    AuthModule,
    ChannelsModule,
    QueueModule,
    RateLimitModule,
    ObservabilityModule,
    OperationsModule,
    TicketsModule,
    DraftsModule,
    OrgsModule,
    ApprovalsModule,
    KnowledgeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
