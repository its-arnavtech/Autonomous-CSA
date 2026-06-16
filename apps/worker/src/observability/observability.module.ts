import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '../prisma.module';
import { WorkerShutdownStateService } from '../runtime/worker-shutdown-state.service';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { WorkerExceptionFilter } from './exception.filter';
import { HttpLoggingInterceptor } from './http-logging.interceptor';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

@Module({
  imports: [PrismaModule],
  controllers: [HealthController, MetricsController],
  providers: [
    WorkerShutdownStateService,
    HealthService,
    MetricsService,
    {
      provide: APP_FILTER,
      useClass: WorkerExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLoggingInterceptor,
    },
  ],
  exports: [MetricsService, WorkerShutdownStateService],
})
export class ObservabilityModule {}
