import { BadRequestException } from '@nestjs/common';
import { ApprovalsController } from './approvals.controller';

describe('ApprovalsController', () => {
  function createController() {
    const prisma = {
      agentRun: { findFirst: jest.fn() },
      humanApproval: {
        create: jest.fn(),
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      outboundDraft: {
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const supportService = {
      assertTicketAccess: jest.fn(),
      getApprovalOrThrow: jest.fn(),
      appendTimelineEvent: jest.fn(),
    };
    const channelsService = {
      createOutboundForApprovedDraft: jest.fn().mockResolvedValue(null),
      enqueueDelivery: jest.fn(),
    };

    return {
      prisma,
      supportService,
      channelsService,
      controller: new ApprovalsController(
        prisma as never,
        supportService as never,
        channelsService as never,
      ),
    };
  }

  it('creates a pending approval scaffold', async () => {
    const { controller, prisma, supportService } = createController();
    supportService.assertTicketAccess.mockResolvedValue({
      ticket: { id: 'ticket_1' },
    });
    prisma.humanApproval.create.mockResolvedValue({
      id: 'approval_1',
      status: 'PENDING',
    });

    const approval = await controller.createApproval(
      {
        ticketId: 'ticket_1',
        proposedResponse: 'Draft response',
      },
      {
        organizationId: 'org_1',
      } as never,
    );

    expect(prisma.humanApproval.create).toHaveBeenCalledWith({
      data: {
        orgId: 'org_1',
        ticketId: 'ticket_1',
        agentRunId: undefined,
        status: 'PENDING',
        proposedResponse: 'Draft response',
      },
    });
    expect(approval.status).toBe('PENDING');
  });

  it('rejects an unrelated agentRunId during approval creation', async () => {
    const { controller, prisma, supportService } = createController();
    supportService.assertTicketAccess.mockResolvedValue({
      ticket: { id: 'ticket_1' },
    });
    prisma.agentRun.findFirst.mockResolvedValue(null);

    await expect(
      controller.createApproval(
        {
          ticketId: 'ticket_1',
          agentRunId: 'run_1',
        },
        {
          organizationId: 'org_1',
        } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['APPROVED', 'REJECTED'] as const)(
    'updates approval status to %s',
    async (decision) => {
      const { controller, prisma, supportService, channelsService } =
        createController();
      supportService.getApprovalOrThrow.mockResolvedValue({
        approval: {
          id: 'approval_1',
          ticketId: 'ticket_1',
          agentRunId: 'run_1',
          outboundDraftId: 'draft_1',
          proposedResponse: 'Draft body',
        },
      });
      prisma.$transaction.mockImplementation(
        async (callback: (tx: typeof prisma) => Promise<unknown>) =>
          callback(prisma),
      );
      prisma.humanApproval.updateMany.mockResolvedValue({
        count: 1,
      });
      prisma.humanApproval.findUniqueOrThrow.mockResolvedValue({
        id: 'approval_1',
        status: decision,
      });
      prisma.outboundDraft.update.mockResolvedValue({
        id: 'draft_1',
        status: decision,
      });
      channelsService.createOutboundForApprovedDraft.mockResolvedValue({
        id: 'outbound_1',
      });

      const approval = await controller.updateApproval(
        'approval_1',
        {
          status: decision,
          reviewerNote: 'Reviewed by QA',
        },
        {
          organizationId: 'org_1',
        } as never,
        {
          userId: 'user_1',
        } as never,
      );

      expect(prisma.humanApproval.updateMany).toHaveBeenCalledWith({
        where: { id: 'approval_1', status: 'PENDING' },
        data: {
          status: decision,
          reviewerNote: 'Reviewed by QA',
          reviewedByUserId: 'user_1',
        },
      });
      expect(prisma.outboundDraft.update).toHaveBeenCalled();
      if (decision === 'APPROVED') {
        expect(
          channelsService.createOutboundForApprovedDraft,
        ).toHaveBeenCalledWith(
          prisma,
          'org_1',
          'draft_1',
          'user_1',
        );
        expect(channelsService.enqueueDelivery).toHaveBeenCalledWith(
          'outbound_1',
        );
      } else {
        expect(
          channelsService.createOutboundForApprovedDraft,
        ).not.toHaveBeenCalled();
        expect(channelsService.enqueueDelivery).not.toHaveBeenCalled();
      }
      expect(approval.status).toBe(decision);
    },
  );
});
