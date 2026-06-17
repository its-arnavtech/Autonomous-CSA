import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrganization } from '../auth/current-organization.decorator';
import type { TenantMembership } from '../auth/authenticated-user.type';
import { JwtAccessGuard } from '../auth/jwt-access.guard';
import { READ_ORG_ROLES } from '../auth/organization-role.constants';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import { ChannelsService } from './channels.service';

@ApiTags('ticket-channels')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard, TenantContextGuard, RolesGuard)
@Controller('tickets')
export class ChannelTicketController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get(':ticketId/conversation')
  @ApiOperation({ summary: 'Get channel conversation context for a ticket' })
  @Roles(...READ_ORG_ROLES)
  getConversation(
    @CurrentOrganization() organization: TenantMembership,
    @Param('ticketId') ticketId: string,
  ) {
    return this.channelsService.getTicketConversation(
      organization.organizationId,
      ticketId,
    );
  }

  @Get(':ticketId/channel-messages')
  @ApiOperation({ summary: 'List channel messages for a ticket' })
  @Roles(...READ_ORG_ROLES)
  listMessages(
    @CurrentOrganization() organization: TenantMembership,
    @Param('ticketId') ticketId: string,
  ) {
    return this.channelsService.listTicketMessages(
      organization.organizationId,
      ticketId,
    );
  }

  @Get(':ticketId/outbound-messages')
  @ApiOperation({ summary: 'List channel outbound messages for a ticket' })
  @Roles(...READ_ORG_ROLES)
  listOutboundMessages(
    @CurrentOrganization() organization: TenantMembership,
    @Param('ticketId') ticketId: string,
  ) {
    return this.channelsService.listTicketOutboundMessages(
      organization.organizationId,
      ticketId,
    );
  }
}
