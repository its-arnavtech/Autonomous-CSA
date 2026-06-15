import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrganization } from '../auth/current-organization.decorator';
import type { TenantMembership } from '../auth/authenticated-user.type';
import { JwtAccessGuard } from '../auth/jwt-access.guard';
import { READ_ORG_ROLES } from '../auth/organization-role.constants';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import { SupportService } from '../support/support.service';

@ApiTags('tickets')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard, TenantContextGuard, RolesGuard)
@Controller('tickets')
export class TicketsTimelineController {
  constructor(private readonly supportService: SupportService) {}

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Get ticket timeline events' })
  @Roles(...READ_ORG_ROLES)
  async getTimeline(
    @Param('id') ticketId: string,
    @CurrentOrganization() organization: TenantMembership,
  ) {
    return this.supportService.getTimeline(ticketId, organization.organizationId);
  }
}
