import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ApprovalsModule } from './approvals/approvals.module';
import { DraftsModule } from './drafts/drafts.module';
import { HealthController } from './health.controller';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { OrgsModule } from './orgs/orgs.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { SupportModule } from './support/support.module';
import { TicketsModule } from './tickets/tickets.module';

@Module({
  imports: [
    PrismaModule,
    SupportModule,
    QueueModule,
    TicketsModule,
    DraftsModule,
    OrgsModule,
    ApprovalsModule,
    KnowledgeModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
