import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
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

@ApiTags('outbound-messages')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard, TenantContextGuard, RolesGuard)
@Controller('outbound-messages')
export class OutboundMessagesController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get one tenant outbound channel message' })
  @Roles(...READ_ORG_ROLES)
  getOutboundMessage(
    @CurrentOrganization() organization: TenantMembership,
    @Param('id') outboundMessageId: string,
  ) {
    return this.channelsService.getOutboundMessage(
      organization.organizationId,
      outboundMessageId,
    );
  }

  @Post(':id/replay')
  @ApiOperation({ summary: 'Replay one failed tenant outbound channel message' })
  @Roles(...MANAGE_ORG_ROLES)
  replayOutboundMessage(
    @CurrentOrganization() organization: TenantMembership,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') outboundMessageId: string,
  ) {
    return this.channelsService.replayOutboundMessage(
      organization.organizationId,
      outboundMessageId,
      user.userId,
    );
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel one pending tenant outbound channel message' })
  @Roles(...MANAGE_ORG_ROLES)
  cancelOutboundMessage(
    @CurrentOrganization() organization: TenantMembership,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') outboundMessageId: string,
  ) {
    return this.channelsService.cancelOutboundMessage(
      organization.organizationId,
      outboundMessageId,
      user.userId,
    );
  }
}
