import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { HealthController } from '../health.controller';
import { ApiExceptionFilter } from './api-exception.filter';
import { HealthService } from './health.service';
import { HttpLoggingInterceptor } from './http-logging.interceptor';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

@Module({
  controllers: [HealthController, MetricsController],
  providers: [
    HealthService,
    MetricsService,
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLoggingInterceptor,
    },
  ],
  exports: [MetricsService],
})
export class ObservabilityModule {}
