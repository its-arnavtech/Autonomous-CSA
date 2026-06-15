import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrganization } from '../auth/current-organization.decorator';
import type { TenantMembership } from '../auth/authenticated-user.type';
import { JwtAccessGuard } from '../auth/jwt-access.guard';
import {
  MANAGE_ORG_ROLES,
  READ_ORG_ROLES,
} from '../auth/organization-role.constants';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import { PrismaService } from '../prisma/prisma.service';
import { SupportService } from '../support/support.service';
import { UpdateOrganizationSettingsDto } from './org-settings.dto';

@ApiTags('orgs')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard, TenantContextGuard, RolesGuard)
@Controller('orgs')
export class OrgsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supportService: SupportService,
  ) {}

  @Get('settings')
  @ApiOperation({
    summary: 'Get organization settings, creating defaults if missing',
  })
  @Roles(...READ_ORG_ROLES)
  async getSettings(@CurrentOrganization() organization: TenantMembership) {
    return this.supportService.getOrCreateOrganizationSettings(
      organization.organizationId,
    );
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Update organization settings' })
  @Roles(...MANAGE_ORG_ROLES)
  async updateSettings(
    @Body() dto: UpdateOrganizationSettingsDto,
    @CurrentOrganization() organization: TenantMembership,
  ) {
    await this.supportService.getOrCreateOrganizationSettings(
      organization.organizationId,
    );

    return this.prisma.organizationSettings.update({
      where: { orgId: organization.organizationId },
      data: dto,
    });
  }
}
