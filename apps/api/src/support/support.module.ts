import { Global, Module } from '@nestjs/common';
import { ObservabilityModule } from '../observability/observability.module';
import { SupportService } from './support.service';

@Global()
@Module({
  imports: [ObservabilityModule],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
