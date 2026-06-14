import { Global, Module } from '@nestjs/common';
import { SupportService } from './support.service';

@Global()
@Module({
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
