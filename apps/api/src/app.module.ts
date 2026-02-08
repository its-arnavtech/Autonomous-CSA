import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health.controller';
import { QueueModule } from './queue/queue.module';
import { TicketsModule } from './tickets/tickets.module';

@Module({
  imports: [QueueModule, TicketsModule],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
