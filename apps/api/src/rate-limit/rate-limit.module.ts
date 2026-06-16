import { Global, Module } from '@nestjs/common';
import { ObservabilityModule } from '../observability/observability.module';
import { RateLimitService } from './rate-limit.service';

@Global()
@Module({
  imports: [ObservabilityModule],
  providers: [RateLimitService],
  exports: [RateLimitService],
})
export class RateLimitModule {}
