import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './observability/health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getHealth() {
    return this.healthService.getLiveStatus();
  }

  @Get('live')
  getLiveHealth() {
    return this.healthService.getLiveStatus();
  }

  @Get('ready')
  async getReadyHealth() {
    const status = await this.healthService.getReadyStatus();
    if (status.status !== 'ready') {
      throw new ServiceUnavailableException(status);
    }

    return status;
  }
}
