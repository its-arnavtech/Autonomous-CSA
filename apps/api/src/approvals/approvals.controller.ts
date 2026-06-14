import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  AgentEventType,
  ApprovalStatus,
  DraftStatus,
} from '@agentic-support/db';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { SupportService } from '../support/support.service';
import { CreateApprovalDto, UpdateApprovalDto } from './approvals.dto';

@ApiTags('approvals')
@Controller('approvals')
export class ApprovalsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supportService: SupportService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a pending human approval record' })
  async createApproval(@Body() dto: CreateApprovalDto) {
    const { organization, ticket } =
      await this.supportService.assertTicketAccess(dto.ticketId, dto.orgId);

    if (dto.agentRunId) {
      const agentRun = await this.prisma.agentRun.findFirst({
        where: {
          id: dto.agentRunId,
          orgId: organization.id,
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
        orgId: organization.id,
        ticketId: ticket.id,
        agentRunId: dto.agentRunId,
        status: ApprovalStatus.PENDING,
        proposedResponse: dto.proposedResponse,
      },
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Approve or reject a human approval record' })
  async updateApproval(
    @Param('id') approvalId: string,
    @Body() dto: UpdateApprovalDto,
  ) {
    const { organization, approval } =
      await this.supportService.getApprovalOrThrow(approvalId, dto.orgId);

    return this.prisma.$transaction(async (tx) => {
      const updatedApproval = await tx.humanApproval.update({
        where: { id: approvalId },
        data: {
          status: dto.status,
          reviewerNote: dto.reviewerNote,
        },
      });

      if (approval.outboundDraftId) {
        if (dto.status === 'APPROVED') {
          await tx.outboundDraft.update({
            where: { id: approval.outboundDraftId },
            data: {
              status: DraftStatus.APPROVED,
              approvedBy: 'human_stub',
              rejectedReason: null,
              body: approval.proposedResponse ?? undefined,
            },
          });

          await this.supportService.appendTimelineEvent(
            tx,
            organization.id,
            approval.ticketId,
            AgentEventType.DRAFT_APPROVED,
            {
              approvalId,
              draftId: approval.outboundDraftId,
              status: DraftStatus.APPROVED,
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
            organization.id,
            approval.ticketId,
            AgentEventType.DRAFT_REJECTED,
            {
              approvalId,
              draftId: approval.outboundDraftId,
              status: DraftStatus.REJECTED,
            },
            approval.agentRunId ?? undefined,
          );
        }
      }

      return updatedApproval;
    });
  }
}
