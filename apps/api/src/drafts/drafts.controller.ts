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
  MUTATING_ORG_ROLES,
  READ_ORG_ROLES,
} from '../auth/organization-role.constants';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import { SupportService } from '../support/support.service';
import { SendDraftDto, UpdateDraftDto } from './drafts.dto';

@ApiTags('drafts')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard, TenantContextGuard, RolesGuard)
@Controller('drafts')
export class DraftsController {
  constructor(private readonly supportService: SupportService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get one outbound draft' })
  @Roles(...READ_ORG_ROLES)
  async getDraft(
    @Param('id') draftId: string,
    @CurrentOrganization() organization: TenantMembership,
  ) {
    return this.supportService.getDraftDetail(draftId, organization.organizationId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit an outbound draft' })
  @Roles(...MUTATING_ORG_ROLES)
  async updateDraft(
    @Param('id') draftId: string,
    @Body() dto: UpdateDraftDto,
    @CurrentOrganization() organization: TenantMembership,
  ) {
    return this.supportService.editDraft(
      draftId,
      organization.organizationId,
      dto.body,
    );
  }

  @Post(':id/send')
  @ApiOperation({
    summary: 'Send an approved outbound draft as an outbound message',
  })
  @Roles(...MUTATING_ORG_ROLES)
  async sendDraft(
    @Param('id') draftId: string,
    @Body() _dto: SendDraftDto,
    @CurrentOrganization() organization: TenantMembership,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.supportService.sendDraft(
      draftId,
      organization.organizationId,
      user.userId,
    );
  }
}
