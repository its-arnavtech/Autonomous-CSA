import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SupportService } from '../support/support.service';
import { OrgQueryDto } from './tickets.dto';

@ApiTags('tickets')
@Controller('tickets')
export class TicketsTimelineController {
  constructor(private readonly supportService: SupportService) {}

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Get ticket timeline events' })
  async getTimeline(
    @Param('id') ticketId: string,
    @Query() query: OrgQueryDto,
  ) {
    return this.supportService.getTimeline(ticketId, query.orgId ?? 'org_demo');
  }
}
