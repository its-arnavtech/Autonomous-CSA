import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
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
import {
  OperationsAuditQueryDto,
  OperationsFailuresQueryDto,
  OperationsRunsQueryDto,
  ResolveFailureDto,
} from './operations.dto';
import { OperationsService } from './operations.service';

@ApiTags('operations')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard, TenantContextGuard, RolesGuard)
@Controller('operations')
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get tenant-scoped operations summary' })
  @Roles(...READ_ORG_ROLES)
  getSummary(@CurrentOrganization() organization: TenantMembership) {
    return this.operationsService.getSummary(organization.organizationId);
  }

  @Get('runs')
  @ApiOperation({ summary: 'List tenant-scoped agent runs' })
  @Roles(...READ_ORG_ROLES)
  listRuns(
    @CurrentOrganization() organization: TenantMembership,
    @Query() query: OperationsRunsQueryDto,
  ) {
    return this.operationsService.listRuns(organization.organizationId, query);
  }

  @Get('runs/:id')
  @ApiOperation({ summary: 'Get a tenant-scoped agent run detail' })
  @Roles(...READ_ORG_ROLES)
  getRun(
    @CurrentOrganization() organization: TenantMembership,
    @Param('id') runId: string,
  ) {
    return this.operationsService.getRun(organization.organizationId, runId);
  }

  @Get('failures')
  @ApiOperation({ summary: 'List tenant-scoped operational failures' })
  @Roles(...READ_ORG_ROLES)
  listFailures(
    @CurrentOrganization() organization: TenantMembership,
    @Query() query: OperationsFailuresQueryDto,
  ) {
    return this.operationsService.listFailures(
      organization.organizationId,
      query,
    );
  }

  @Get('failures/:id')
  @ApiOperation({ summary: 'Get a tenant-scoped failure detail' })
  @Roles(...READ_ORG_ROLES)
  getFailure(
    @CurrentOrganization() organization: TenantMembership,
    @Param('id') failureId: string,
  ) {
    return this.operationsService.getFailure(
      organization.organizationId,
      failureId,
    );
  }

  @Post('failures/:id/replay')
  @ApiOperation({ summary: 'Replay a tenant-scoped operational failure' })
  @Roles(...MANAGE_ORG_ROLES)
  replayFailure(
    @CurrentOrganization() organization: TenantMembership,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') failureId: string,
  ) {
    return this.operationsService.replayFailure(
      organization.organizationId,
      failureId,
      user.userId,
    );
  }

  @Patch('failures/:id/resolve')
  @ApiOperation({ summary: 'Resolve a tenant-scoped operational failure' })
  @Roles(...MANAGE_ORG_ROLES)
  resolveFailure(
    @CurrentOrganization() organization: TenantMembership,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') failureId: string,
    @Body() dto: ResolveFailureDto,
  ) {
    return this.operationsService.resolveFailure(
      organization.organizationId,
      failureId,
      user.userId,
      dto.note,
    );
  }

  @Get('audit')
  @ApiOperation({ summary: 'Search tenant-scoped audit events' })
  @Roles(...READ_ORG_ROLES)
  searchAudit(
    @CurrentOrganization() organization: TenantMembership,
    @Query() query: OperationsAuditQueryDto,
  ) {
    return this.operationsService.searchAudit(organization.organizationId, query);
  }

  @Get('audit/export')
  @ApiOperation({ summary: 'Export tenant-scoped audit events as CSV' })
  @Roles(...READ_ORG_ROLES)
  async exportAudit(
    @CurrentOrganization() organization: TenantMembership,
    @Query() query: OperationsAuditQueryDto,
    @Res() response: Response,
  ) {
    const csv = await this.operationsService.exportAuditCsv(
      organization.organizationId,
      query,
    );

    response.setHeader('content-type', 'text/csv; charset=utf-8');
    response.setHeader(
      'content-disposition',
      'attachment; filename="operations-audit.csv"',
    );
    response.send(csv);
  }
}
