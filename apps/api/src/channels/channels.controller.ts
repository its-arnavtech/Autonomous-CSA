import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrganization } from '../auth/current-organization.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type {
  AuthenticatedUser,
  TenantMembership,
} from '../auth/authenticated-user.type';
import { JwtAccessGuard } from '../auth/jwt-access.guard';
import {
  MANAGE_ORG_ROLES,
  READ_ORG_ROLES,
} from '../auth/organization-role.constants';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import { ChannelsService } from './channels.service';
import {
  CreateChannelConnectionDto,
  UpdateChannelConnectionDto,
} from './channels.dto';

@ApiTags('channel-connections')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard, TenantContextGuard, RolesGuard)
@Controller('channel-connections')
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get()
  @ApiOperation({ summary: 'List tenant channel connections' })
  @Roles(...READ_ORG_ROLES)
  listConnections(@CurrentOrganization() organization: TenantMembership) {
    return this.channelsService.listConnections(organization.organizationId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a tenant channel connection' })
  @Roles(...MANAGE_ORG_ROLES)
  createConnection(
    @CurrentOrganization() organization: TenantMembership,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateChannelConnectionDto,
  ) {
    return this.channelsService.createConnection(
      organization.organizationId,
      dto,
      user.userId,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one tenant channel connection' })
  @Roles(...READ_ORG_ROLES)
  getConnection(
    @CurrentOrganization() organization: TenantMembership,
    @Param('id') connectionId: string,
  ) {
    return this.channelsService.getConnection(
      organization.organizationId,
      connectionId,
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update one tenant channel connection' })
  @Roles(...MANAGE_ORG_ROLES)
  updateConnection(
    @CurrentOrganization() organization: TenantMembership,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') connectionId: string,
    @Body() dto: UpdateChannelConnectionDto,
  ) {
    return this.channelsService.updateConnection(
      organization.organizationId,
      connectionId,
      dto,
      user.userId,
    );
  }

  @Post(':id/disable')
  @ApiOperation({ summary: 'Disable one tenant channel connection' })
  @Roles(...MANAGE_ORG_ROLES)
  disableConnection(
    @CurrentOrganization() organization: TenantMembership,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') connectionId: string,
  ) {
    return this.channelsService.setConnectionEnabled(
      organization.organizationId,
      connectionId,
      false,
      user.userId,
    );
  }

  @Post(':id/enable')
  @ApiOperation({ summary: 'Enable one tenant channel connection' })
  @Roles(...MANAGE_ORG_ROLES)
  enableConnection(
    @CurrentOrganization() organization: TenantMembership,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') connectionId: string,
  ) {
    return this.channelsService.setConnectionEnabled(
      organization.organizationId,
      connectionId,
      true,
      user.userId,
    );
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Run a safe channel connection health check' })
  @Roles(...MANAGE_ORG_ROLES)
  testConnection(
    @CurrentOrganization() organization: TenantMembership,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') connectionId: string,
  ) {
    return this.channelsService.testConnection(
      organization.organizationId,
      connectionId,
      user.userId,
    );
  }
}
