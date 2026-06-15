import {
  Controller,
  Get,
  Headers,
  NotFoundException,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { MetricsService } from './metrics.service';

@Controller()
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('metrics')
  async getMetrics(
    @Headers('authorization') authorization: string | undefined,
    @Res() response: Response,
  ) {
    if (!this.metrics.isEnabled()) {
      throw new NotFoundException();
    }

    if (!this.metrics.isAuthorized(authorization)) {
      throw new UnauthorizedException('Metrics authentication required');
    }

    response.setHeader('content-type', this.metrics.getContentType());
    response.send(await this.metrics.render());
  }
}
