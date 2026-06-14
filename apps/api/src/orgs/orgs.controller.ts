import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { SupportService } from '../support/support.service';
import { UpdateOrganizationSettingsDto } from './org-settings.dto';

@ApiTags('orgs')
@Controller('orgs')
export class OrgsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supportService: SupportService,
  ) {}

  @Get(':orgId/settings')
  @ApiOperation({
    summary: 'Get organization settings, creating defaults if missing',
  })
  async getSettings(@Param('orgId') orgId: string) {
    return this.supportService.getOrCreateOrganizationSettings(orgId);
  }

  @Patch(':orgId/settings')
  @ApiOperation({ summary: 'Update organization settings' })
  async updateSettings(
    @Param('orgId') orgId: string,
    @Body() dto: UpdateOrganizationSettingsDto,
  ) {
    const organization = await this.supportService.resolveOrganization(orgId);
    await this.supportService.getOrCreateOrganizationSettings(orgId);

    return this.prisma.organizationSettings.update({
      where: { orgId: organization.id },
      data: dto,
    });
  }
}
