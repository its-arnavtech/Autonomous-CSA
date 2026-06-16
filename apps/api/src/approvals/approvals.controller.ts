import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  AgentEventType,
  ApprovalStatus,
  DraftStatus,
} from '@agentic-support/db';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType } from '../auth/actor-type.constants';
import { CurrentOrganization } from '../auth/current-organization.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type {
  AuthenticatedUser,
  TenantMembership,
} from '../auth/authenticated-user.type';
import { JwtAccessGuard } from '../auth/jwt-access.guard';
import { MUTATING_ORG_ROLES } from '../auth/organization-role.constants';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import { PrismaService } from '../prisma/prisma.service';
import { SupportService } from '../support/support.service';
import { CreateApprovalDto, UpdateApprovalDto } from './approvals.dto';

@ApiTags('approvals')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard, TenantContextGuard, RolesGuard)
@Controller('approvals')
export class ApprovalsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supportService: SupportService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a pending human approval record' })
  @Roles(...MUTATING_ORG_ROLES)
  async createApproval(
    @Body() dto: CreateApprovalDto,
    @CurrentOrganization() organization: TenantMembership,
  ) {
    const { ticket } = await this.supportService.assertTicketAccess(
      dto.ticketId,
      organization.organizationId,
    );

    if (dto.agentRunId) {
      const agentRun = await this.prisma.agentRun.findFirst({
        where: {
          id: dto.agentRunId,
          orgId: organization.organizationId,
          ticketId: ticket.id,
        },
        select: { id: true },
      });

      if (!agentRun) {
        throw new BadRequestException(
          'agentRunId does not belong to this ticket',
        );
      }
    }

    return this.prisma.humanApproval.create({
      data: {
        orgId: organization.organizationId,
        ticketId: ticket.id,
        agentRunId: dto.agentRunId,
        status: ApprovalStatus.PENDING,
        proposedResponse: dto.proposedResponse,
      },
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Approve or reject a human approval record' })
  @Roles(...MUTATING_ORG_ROLES)
  async updateApproval(
    @Param('id') approvalId: string,
    @Body() dto: UpdateApprovalDto,
    @CurrentOrganization() organization: TenantMembership,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { approval } = await this.supportService.getApprovalOrThrow(
      approvalId,
      organization.organizationId,
    );

    return this.prisma.$transaction(async (tx) => {
      const transition = await tx.humanApproval.updateMany({
        where: {
          id: approvalId,
          status: ApprovalStatus.PENDING,
        },
        data: {
          status: dto.status,
          reviewerNote: dto.reviewerNote,
          reviewedByUserId: user.userId,
        },
      });

      if (transition.count !== 1) {
        throw new BadRequestException('Approval has already been decided');
      }

      const updatedApproval = await tx.humanApproval.findUniqueOrThrow({
        where: { id: approvalId },
      });

      if (approval.outboundDraftId) {
        if (dto.status === 'APPROVED') {
          await tx.outboundDraft.update({
            where: { id: approval.outboundDraftId },
            data: {
              status: DraftStatus.APPROVED,
              approvedBy: `user:${user.userId}`,
              approvedByType: ActorType.USER,
              approvedByUserId: user.userId,
              rejectedReason: null,
              body: approval.proposedResponse ?? undefined,
            },
          });

          await this.supportService.appendTimelineEvent(
            tx,
            organization.organizationId,
            approval.ticketId,
            AgentEventType.DRAFT_APPROVED,
            {
              approvalId,
              draftId: approval.outboundDraftId,
              status: DraftStatus.APPROVED,
              actorType: ActorType.USER,
              actorUserId: user.userId,
            },
            approval.agentRunId ?? undefined,
          );
        }

        if (dto.status === 'REJECTED') {
          await tx.outboundDraft.update({
            where: { id: approval.outboundDraftId },
            data: {
              status: DraftStatus.REJECTED,
              rejectedReason: dto.reviewerNote ?? null,
            },
          });

          await this.supportService.appendTimelineEvent(
            tx,
            organization.organizationId,
            approval.ticketId,
            AgentEventType.DRAFT_REJECTED,
            {
              approvalId,
              draftId: approval.outboundDraftId,
              status: DraftStatus.REJECTED,
              actorType: ActorType.USER,
              actorUserId: user.userId,
            },
            approval.agentRunId ?? undefined,
          );
        }
      }

      return updatedApproval;
    });
  }
}
