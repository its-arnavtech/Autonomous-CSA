import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import {
  AgentEventType,
  AgentRunStatus,
  AgentRunTrigger,
  ChannelConnectionStatus,
  ChannelProvider,
  ConversationStatus,
  DraftStatus,
  ExternalMessageDirection,
  InboundDispatchStatus,
  MessageDirection,
  MessageStatus,
  OutboundMessageStatus,
  Prisma,
  TicketPriority,
  TicketStatus,
  WebhookReceiptStatus,
  nextEventSequence,
} from '@agentic-support/db';
import {
  getCorrelationContext,
  sanitizeForLog,
} from '@agentic-support/observability';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../observability/metrics.service';
import {
  CHANNEL_DELIVERY_QUEUE_NAME,
  SUPPORT_QUEUE_NAME,
} from '../queue/queue.config';
import {
  ParsedChannelEvent,
  ParsedInboundEvent,
  SupportChannelProvider,
} from './channel-provider.interface';
import {
  normalizeEmail,
  sanitizeHtml,
  sanitizeSubject,
  sha256Hex,
  stableStringify,
  truncateText,
} from './channel-sanitizer';
import { CreateChannelConnectionDto, UpdateChannelConnectionDto } from './channels.dto';
import { MockEmailProvider } from './mock-email.provider';

const MAX_WEBHOOK_BYTES = Number.parseInt(
  process.env.CHANNEL_WEBHOOK_PAYLOAD_LIMIT_BYTES?.trim() ?? '262144',
  10,
);
const REPLAY_BLOCKED_STATUSES = new Set<OutboundMessageStatus>([
  OutboundMessageStatus.SENT,
  OutboundMessageStatus.DELIVERED,
  OutboundMessageStatus.CANCELLED,
]);
const CANCEL_BLOCKED_STATUSES = new Set<OutboundMessageStatus>([
  OutboundMessageStatus.SENT,
  OutboundMessageStatus.DELIVERED,
  OutboundMessageStatus.DEAD_LETTER,
]);
const INBOUND_DISPATCH_LEASE_MS = Math.max(
  Number.parseInt(process.env.CHANNEL_INBOUND_DISPATCH_LEASE_MS ?? '120000', 10),
  10_000,
);
const INBOUND_DISPATCH_RETRY_DELAY_MS = Math.max(
  Number.parseInt(
    process.env.CHANNEL_INBOUND_DISPATCH_RETRY_DELAY_MS ?? '5000',
    10,
  ),
  500,
);
const QUEUE_ENQUEUE_TIMEOUT_MS = Math.max(
  Number.parseInt(process.env.CHANNEL_QUEUE_ENQUEUE_TIMEOUT_MS ?? '3000', 10),
  500,
);

function redactedMessage(error: unknown) {
  return (
    truncateText(error instanceof Error ? error.message : String(error), 500) ??
    'Unknown channel error'
  );
}

async function withQueueEnqueueTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Queue enqueue timed out')),
          QUEUE_ENQUEUE_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function isUniqueConstraint(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

@Injectable()
export class ChannelsService {
  private readonly providers = new Map<ChannelProvider, SupportChannelProvider>([
    [ChannelProvider.MOCK_EMAIL, new MockEmailProvider()],
  ]);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(SUPPORT_QUEUE_NAME) private readonly supportQueue: Queue,
    @InjectQueue(CHANNEL_DELIVERY_QUEUE_NAME)
    private readonly deliveryQueue: Queue,
    private readonly metrics: MetricsService,
  ) {}

  async listConnections(orgId: string) {
    const connections = await this.prisma.channelConnection.findMany({
      where: { organizationId: orgId },
      orderBy: [{ createdAt: 'desc' }],
    });

    return connections.map((connection) => this.toSafeConnection(connection));
  }

  async createConnection(
    orgId: string,
    dto: CreateChannelConnectionDto,
    actorUserId?: string,
  ) {
    if (dto.provider !== ChannelProvider.MOCK_EMAIL) {
      throw new BadRequestException(
        'Only MOCK_EMAIL is available in zero-spend local mode',
      );
    }

    const connection = await this.prisma.channelConnection.create({
      data: {
        organizationId: orgId,
        provider: dto.provider,
        displayName: dto.displayName.trim(),
        externalAccountId: dto.externalAccountId?.trim() || `mock:${orgId}`,
        inboundAddress: dto.inboundAddress?.trim() || 'support@example.test',
        webhookSigningSecretReference: `mock:${
          dto.webhookSecret?.trim() ||
          process.env.MOCK_CHANNEL_WEBHOOK_SECRET?.trim() ||
          'mock-webhook-secret'
        }`,
        config: (dto.config ?? { mode: 'mock' }) as Prisma.InputJsonValue,
        isDefault: dto.isDefault ?? true,
      },
    });

    await this.recordChannelAudit({
      orgId,
      actorUserId,
      action: 'channel_connection.created',
      targetId: connection.id,
      metadata: { provider: connection.provider },
    });

    return this.toSafeConnection(connection);
  }

  async getConnection(orgId: string, connectionId: string) {
    const connection = await this.prisma.channelConnection.findFirst({
      where: { id: connectionId, organizationId: orgId },
    });

    if (!connection) {
      throw new NotFoundException('Channel connection not found');
    }

    return this.toSafeConnection(connection);
  }

  async updateConnection(
    orgId: string,
    connectionId: string,
    dto: UpdateChannelConnectionDto,
    actorUserId?: string,
  ) {
    await this.getConnection(orgId, connectionId);

    const connection = await this.prisma.channelConnection.update({
      where: { id: connectionId },
      data: {
        displayName: dto.displayName?.trim(),
        inboundAddress: dto.inboundAddress?.trim(),
        config: dto.config as Prisma.InputJsonValue | undefined,
        isDefault: dto.isDefault,
      },
    });

    await this.recordChannelAudit({
      orgId,
      actorUserId,
      action: 'channel_connection.updated',
      targetId: connection.id,
      metadata: { provider: connection.provider },
    });

    return this.toSafeConnection(connection);
  }

  async setConnectionEnabled(
    orgId: string,
    connectionId: string,
    enabled: boolean,
    actorUserId?: string,
  ) {
    await this.getConnection(orgId, connectionId);

    const connection = await this.prisma.channelConnection.update({
      where: { id: connectionId },
      data: {
        status: enabled
          ? ChannelConnectionStatus.ACTIVE
          : ChannelConnectionStatus.DISABLED,
        disabledAt: enabled ? null : new Date(),
        lastErrorCode: enabled ? null : undefined,
        lastErrorRedacted: enabled ? null : undefined,
      },
    });

    await this.recordChannelAudit({
      orgId,
      actorUserId,
      action: enabled
        ? 'channel_connection.enabled'
        : 'channel_connection.disabled',
      targetId: connection.id,
      metadata: { provider: connection.provider },
    });

    return this.toSafeConnection(connection);
  }

  async testConnection(
    orgId: string,
    connectionId: string,
    actorUserId?: string,
  ) {
    const connection = await this.prisma.channelConnection.findFirst({
      where: { id: connectionId, organizationId: orgId },
    });

    if (!connection) {
      throw new NotFoundException('Channel connection not found');
    }

    const provider = this.getProvider(connection.provider);
    const result = await provider.healthCheck?.();
    await this.prisma.channelConnection.update({
      where: { id: connection.id },
      data: {
        lastSuccessfulEventAt: result?.ok ? new Date() : undefined,
        lastErrorAt: result?.ok ? null : new Date(),
        lastErrorCode: result?.ok ? null : 'HEALTH_CHECK_FAILED',
        lastErrorRedacted: result?.ok ? null : 'Mock provider health check failed',
      },
    });
    await this.recordChannelAudit({
      orgId,
      actorUserId,
      action: 'channel_connection.tested',
      targetId: connection.id,
      metadata: { provider: connection.provider, ok: result?.ok ?? true },
    });

    return {
      ok: result?.ok ?? true,
      provider: connection.provider,
      details: sanitizeForLog(result?.details ?? {}),
    };
  }

  async ingestWebhook(
    publicId: string,
    payload: unknown,
    signature?: string | null,
    rawBody?: Buffer,
  ) {
    const payloadText = stableStringify(payload);
    const payloadBytes = rawBody?.length ?? Buffer.byteLength(payloadText, 'utf8');
    if (payloadBytes > MAX_WEBHOOK_BYTES) {
      throw new BadRequestException('Webhook payload too large');
    }

    const connection = await this.prisma.channelConnection.findUnique({
      where: { publicId },
    });

    if (!connection) {
      throw new NotFoundException('Channel connection not found');
    }

    const provider = this.getProvider(connection.provider);
    const verified = await provider.verifyWebhook({
      payload,
      rawBody,
      signatureHeader: signature,
      secretReference: connection.webhookSigningSecretReference,
    });
    const payloadHash = sha256Hex(rawBody ?? payloadText);
    const correlationId = getCorrelationContext()?.correlationId ?? null;
    const fallbackEventId = `unverified:${payloadHash.slice(0, 32)}`;

    if (!verified.verified) {
      this.metrics.incrementChannelSignatureFailure(connection.provider);
      await this.prisma.webhookReceipt.create({
        data: {
          organizationId: connection.organizationId,
          channelConnectionId: connection.id,
          provider: connection.provider,
          providerEventId: verified.providerEventId ?? fallbackEventId,
          eventType: verified.eventType ?? 'unknown',
          signatureVerified: false,
          payloadHash,
          status: WebhookReceiptStatus.REJECTED,
          failureCode: verified.failureCode ?? 'INVALID_SIGNATURE',
          failureMessageRedacted: verified.failureMessage ?? 'Invalid signature',
          correlationId,
        },
      }).catch(() => undefined);

      throw new ForbiddenException('Invalid webhook signature');
    }

    let parsed: ParsedChannelEvent;
    try {
      parsed = await provider.parseEvent({ payload });
    } catch (error) {
      await this.recordRejectedVerifiedReceipt({
        connection,
        providerEventId: verified.providerEventId ?? fallbackEventId,
        eventType: verified.eventType ?? 'malformed',
        payloadHash,
        failureCode: 'MALFORMED_PAYLOAD',
        failureMessageRedacted: redactedMessage(error),
        correlationId,
      });
      throw new BadRequestException('Malformed webhook payload');
    }

    const eventId =
      parsed.kind === 'inbound'
        ? parsed.inbound.providerEventId
        : parsed.callback.providerEventId;
    const eventType =
      parsed.kind === 'inbound' ? parsed.inbound.eventType : parsed.callback.eventType;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const receipt = await tx.webhookReceipt.create({
          data: {
            organizationId: connection.organizationId,
            channelConnectionId: connection.id,
            provider: connection.provider,
            providerEventId: eventId,
            eventType,
            signatureVerified: true,
            payloadHash,
            status: WebhookReceiptStatus.PROCESSING,
            correlationId,
          },
        });

        if (parsed.kind === 'delivery_callback') {
          return this.processDeliveryCallback(tx, connection, receipt.id, parsed);
        }

        return this.processInboundMessage(tx, connection, receipt.id, parsed.inbound);
      });

      const dispatchId = 'dispatchId' in result ? result.dispatchId : null;
      if (dispatchId) {
        await this.dispatchPendingInbound();
      }
      this.metrics.incrementChannelWebhook(
        connection.provider,
        eventType,
        'success',
      );

      return result.response;
    } catch (error) {
      if (isUniqueConstraint(error)) {
        await this.prisma.webhookReceipt.updateMany({
          where: {
            channelConnectionId: connection.id,
            providerEventId: eventId,
          },
          data: {
            status: WebhookReceiptStatus.DUPLICATE,
            retryCount: { increment: 1 },
          },
        });
        this.metrics.incrementChannelDuplicateWebhook(connection.provider);
        this.metrics.incrementChannelWebhook(
          connection.provider,
          eventType,
          'duplicate',
        );
        return { ok: true, duplicate: true, providerEventId: eventId };
      }

      await this.prisma.channelConnection.update({
        where: { id: connection.id },
        data: {
          status: ChannelConnectionStatus.ERROR,
          lastErrorAt: new Date(),
          lastErrorCode: 'WEBHOOK_PROCESSING_FAILED',
          lastErrorRedacted: redactedMessage(error),
        },
      }).catch(() => undefined);
      throw error;
    }
  }

  async getTicketConversation(orgId: string, ticketId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { organizationId: orgId, ticketId },
      include: {
        channelConnection: true,
        externalCustomer: true,
      },
    });

    return conversation
      ? {
          id: conversation.id,
          subject: conversation.subject,
          status: conversation.status,
          externalThreadId: conversation.externalThreadId,
          channel: this.toSafeConnection(conversation.channelConnection),
          customer: conversation.externalCustomer
            ? {
                id: conversation.externalCustomer.id,
                email: conversation.externalCustomer.email,
                displayName: conversation.externalCustomer.displayName,
              }
            : null,
          lastMessageAt: conversation.lastMessageAt,
        }
      : null;
  }

  async listTicketMessages(orgId: string, ticketId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { organizationId: orgId, ticketId },
      select: { id: true },
    });

    if (!conversation) {
      return [];
    }

    return this.prisma.externalMessage.findMany({
      where: { organizationId: orgId, conversationId: conversation.id },
      include: { attachments: true },
      orderBy: [{ createdAt: 'asc' }],
    });
  }

  async listTicketOutboundMessages(orgId: string, ticketId: string) {
    return this.prisma.outboundMessage.findMany({
      where: { organizationId: orgId, ticketId },
      include: { deliveryAttempts: { orderBy: { attemptNumber: 'asc' } } },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async getOutboundMessage(orgId: string, outboundMessageId: string) {
    const outbound = await this.prisma.outboundMessage.findFirst({
      where: { id: outboundMessageId, organizationId: orgId },
      include: { deliveryAttempts: { orderBy: { attemptNumber: 'asc' } } },
    });

    if (!outbound) {
      throw new NotFoundException('Outbound message not found');
    }

    return outbound;
  }

  async replayOutboundMessage(
    orgId: string,
    outboundMessageId: string,
    actorUserId: string,
  ) {
    const outbound = await this.getOutboundMessage(orgId, outboundMessageId);
    if (REPLAY_BLOCKED_STATUSES.has(outbound.status)) {
      throw new BadRequestException('Terminal outbound message cannot be replayed');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.outboundMessage.update({
        where: { id: outbound.id },
        data: {
          status: OutboundMessageStatus.PENDING,
          nextAttemptAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
          lastErrorCode: null,
          lastErrorRedacted: null,
        },
      });

      await this.appendTimelineEvent(tx, orgId, outbound.ticketId, AgentEventType.CHANNEL_MESSAGE_REPLAYED, {
        outboundMessageId: outbound.id,
        actorUserId,
      });
      await tx.channelAuditEvent.create({
        data: {
          organizationId: orgId,
          actorUserId,
          action: 'outbound_message.replayed',
          targetType: 'OutboundMessage',
          targetId: outbound.id,
          correlationId: getCorrelationContext()?.correlationId ?? null,
          metadata: { ticketId: outbound.ticketId },
        },
      });
    });

    await this.enqueueDelivery(outbound.id);
    return this.getOutboundMessage(orgId, outbound.id);
  }

  async cancelOutboundMessage(
    orgId: string,
    outboundMessageId: string,
    actorUserId: string,
  ) {
    const outbound = await this.getOutboundMessage(orgId, outboundMessageId);
    if (CANCEL_BLOCKED_STATUSES.has(outbound.status)) {
      throw new BadRequestException('Terminal outbound message cannot be cancelled');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.outboundMessage.update({
        where: { id: outbound.id },
        data: {
          status: OutboundMessageStatus.CANCELLED,
          failedAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      await this.appendTimelineEvent(tx, orgId, outbound.ticketId, AgentEventType.CHANNEL_OUTBOUND_CANCELLED, {
        outboundMessageId: outbound.id,
        actorUserId,
      });
      await tx.channelAuditEvent.create({
        data: {
          organizationId: orgId,
          actorUserId,
          action: 'outbound_message.cancelled',
          targetType: 'OutboundMessage',
          targetId: outbound.id,
          correlationId: getCorrelationContext()?.correlationId ?? null,
          metadata: { ticketId: outbound.ticketId },
        },
      });
      return updated;
    });
  }

  async createOutboundForApprovedDraft(
    tx: Prisma.TransactionClient,
    orgId: string,
    draftId: string,
    actorUserId: string,
  ) {
    const draft = await tx.outboundDraft.findFirst({
      where: { id: draftId, orgId },
      include: {
        ticket: true,
        agentRun: true,
      },
    });

    if (!draft || draft.status !== DraftStatus.APPROVED) {
      return null;
    }

    if (draft.agentRun?.status === AgentRunStatus.BLOCKED) {
      throw new BadRequestException('Blocked agent run drafts cannot send');
    }

    const conversation = await tx.conversation.findFirst({
      where: {
        organizationId: orgId,
        ticketId: draft.ticketId,
        status: ConversationStatus.OPEN,
        channelConnection: { status: ChannelConnectionStatus.ACTIVE },
      },
      include: { externalCustomer: true, channelConnection: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!conversation || !conversation.externalCustomer) {
      return null;
    }

    const recipientEmail = normalizeEmail(conversation.externalCustomer.email);
    if (!recipientEmail) {
      throw new BadRequestException('Conversation has no verified recipient email');
    }

    const idempotencyKey = `draft:${draft.id}:channel-send:v1`;
    const outbound = await tx.outboundMessage.upsert({
      where: { idempotencyKey },
      update: {},
      create: {
        organizationId: orgId,
        conversationId: conversation.id,
        channelConnectionId: conversation.channelConnectionId,
        ticketId: draft.ticketId,
        draftId: draft.id,
        idempotencyKey,
        subject: conversation.subject,
        textBody: draft.body,
        recipients: [
          {
            email: recipientEmail,
            name: conversation.externalCustomer.displayName,
            externalId: conversation.externalCustomer.externalCustomerId,
          },
        ] as Prisma.InputJsonValue,
        approvedByUserId: actorUserId,
        approvedAt: new Date(),
        maxAttempts: Math.max(
          Number.parseInt(process.env.CHANNEL_DELIVERY_MAX_ATTEMPTS ?? '3', 10),
          1,
        ),
      },
    });

    await this.appendTimelineEvent(
      tx,
      orgId,
      draft.ticketId,
      AgentEventType.CHANNEL_DRAFT_APPROVED_FOR_DELIVERY,
      { draftId: draft.id, outboundMessageId: outbound.id, actorUserId },
      draft.agentRunId ?? undefined,
    );
    await this.appendTimelineEvent(
      tx,
      orgId,
      draft.ticketId,
      AgentEventType.CHANNEL_OUTBOUND_QUEUED,
      { draftId: draft.id, outboundMessageId: outbound.id },
      draft.agentRunId ?? undefined,
    );
    await tx.channelAuditEvent.create({
      data: {
        organizationId: orgId,
        actorUserId,
        action: 'outbound_message.queued_from_approval',
        targetType: 'OutboundMessage',
        targetId: outbound.id,
        correlationId: getCorrelationContext()?.correlationId ?? null,
        metadata: {
          ticketId: draft.ticketId,
          draftId: draft.id,
        },
      },
    });
    this.metrics.incrementChannelOutboundQueued(
      conversation.channelConnection.provider,
    );

    return outbound;
  }

  async enqueueDelivery(outboundMessageId: string) {
    try {
      const outbound = await this.prisma.outboundMessage.findUnique({
        where: { id: outboundMessageId },
        select: { attemptCount: true },
      });
      if (!outbound) {
        return null;
      }

      const job = await withQueueEnqueueTimeout(
        this.deliveryQueue.add(
          'send-outbound-message',
          { outboundMessageId },
          {
            jobId: `channel-delivery-${outboundMessageId}-${outbound.attemptCount}`,
          },
        ),
      );

      return String(job.id);
    } catch (error) {
      await this.prisma.outboundMessage
        .update({
          where: { id: outboundMessageId },
          data: {
            lastErrorCode: 'QUEUE_ENQUEUE_FAILED',
            lastErrorRedacted: redactedMessage(error),
          },
        })
        .catch(() => undefined);
      return null;
    }
  }

  async dispatchPendingInbound(limit = 25) {
    const now = new Date();
    const candidates = await this.prisma.inboundDispatch.findMany({
      where: {
        OR: [
          {
            status: {
              in: [InboundDispatchStatus.PENDING, InboundDispatchStatus.FAILED],
            },
            availableAt: { lte: now },
          },
          {
            status: InboundDispatchStatus.PROCESSING,
            lockExpiresAt: { lt: now },
          },
        ],
      },
      orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
      take: limit,
    });

    const results: Array<{
      id: string;
      status: InboundDispatchStatus;
      jobId?: string;
      errorCode?: string;
    }> = [];
    for (const dispatch of candidates) {
      const lockOwner = `api:${process.pid}:${Date.now()}:${dispatch.id}`;
      const claimed = await this.prisma.inboundDispatch.updateMany({
        where: {
          id: dispatch.id,
          OR: [
            {
              status: {
                in: [
                  InboundDispatchStatus.PENDING,
                  InboundDispatchStatus.FAILED,
                ],
              },
              availableAt: { lte: now },
            },
            {
              status: InboundDispatchStatus.PROCESSING,
              lockExpiresAt: { lt: now },
            },
          ],
        },
        data: {
          status: InboundDispatchStatus.PROCESSING,
          claimedAt: now,
          lockOwner,
          lockExpiresAt: new Date(now.getTime() + INBOUND_DISPATCH_LEASE_MS),
          attemptCount: { increment: 1 },
          lastErrorCode: null,
          lastErrorRedacted: null,
        },
      });

      if (claimed.count !== 1) {
        continue;
      }

      const current = await this.prisma.inboundDispatch.findUnique({
        where: { id: dispatch.id },
      });
      if (!current) {
        continue;
      }

      try {
        const payload = current.payload as {
          orgId: string;
          runId: string;
          ticketId: string;
          subject: string;
          body: string;
          customerEmail: string;
          correlationId?: string | null;
          triggerType: string;
          enqueuedAt: string;
        };
        const job = await withQueueEnqueueTimeout(
          this.supportQueue.add('ticket.process', payload, {
            jobId: `support-${current.runId}`,
          }),
        );

        await this.prisma.inboundDispatch.update({
          where: { id: current.id },
          data: {
            status: InboundDispatchStatus.COMPLETED,
            completedAt: new Date(),
            lockOwner: null,
            lockExpiresAt: null,
            jobId: String(job.id),
            lastErrorCode: null,
            lastErrorRedacted: null,
          },
        });
        results.push({
          id: current.id,
          status: InboundDispatchStatus.COMPLETED,
          jobId: String(job.id),
        });
      } catch (error) {
        await this.prisma.inboundDispatch.update({
          where: { id: current.id },
          data: {
            status: InboundDispatchStatus.PENDING,
            availableAt: new Date(Date.now() + INBOUND_DISPATCH_RETRY_DELAY_MS),
            lockOwner: null,
            lockExpiresAt: null,
            lastErrorCode: 'QUEUE_ENQUEUE_FAILED',
            lastErrorRedacted: redactedMessage(error),
          },
        });
        results.push({
          id: current.id,
          status: InboundDispatchStatus.PENDING,
          errorCode: 'QUEUE_ENQUEUE_FAILED',
        });
      }
    }

    return results;
  }

  private async processInboundMessage(
    tx: Prisma.TransactionClient,
    connection: { id: string; organizationId: string; provider: ChannelProvider },
    receiptId: string,
    event: ParsedInboundEvent,
  ) {
    const orgId = connection.organizationId;
    const normalizedEmail = normalizeEmail(event.from.email);
    const customer = await this.upsertExternalCustomer(tx, {
      orgId,
      channelConnectionId: connection.id,
      externalCustomerId: event.from.externalId,
      email: event.from.email,
      normalizedEmail,
      displayName: event.from.name,
    });
    const conversation = await this.findOrCreateConversation(tx, {
      orgId,
      channelConnectionId: connection.id,
      customerId: customer.id,
      providerThreadId: event.providerThreadId,
      providerMessageId: event.providerMessageId,
      inReplyTo: event.inReplyTo,
      references: event.references ?? [],
      subject: event.subject,
    });
    const body = event.textBody ?? sanitizeHtml(event.htmlBody) ?? '(empty message)';
    const isNewTicket = !conversation.ticketId;
    const runData = await this.ensureTicketAndRun(tx, {
      orgId,
      conversationId: conversation.id,
      webhookReceiptId: receiptId,
      ticketId: conversation.ticketId,
      subject: event.subject ?? '(no subject)',
      body,
      customerEmail: normalizedEmail ?? event.from.email ?? 'unknown@example.invalid',
      customerName: event.from.name,
    });

    const externalMessage = await tx.externalMessage.create({
      data: {
        organizationId: orgId,
        conversationId: conversation.id,
        channelConnectionId: connection.id,
        providerMessageId: event.providerMessageId,
        providerEventId: event.providerEventId,
        direction: ExternalMessageDirection.INBOUND,
        sender: event.from as Prisma.InputJsonValue,
        recipients: event.recipients as Prisma.InputJsonValue,
        subject: event.subject,
        textBody: event.textBody,
        htmlBody: event.htmlBody,
        sanitizedHtmlBody: sanitizeHtml(event.htmlBody),
        inReplyTo: event.inReplyTo,
        references: (event.references ?? []) as Prisma.InputJsonValue,
        receivedAt: event.receivedAt,
        metadata: (event.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    for (const attachment of event.attachments) {
      await tx.messageAttachment.create({
        data: {
          organizationId: orgId,
          externalMessageId: externalMessage.id,
          providerAttachmentId: attachment.providerAttachmentId,
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          contentDisposition: attachment.contentDisposition,
          contentId: attachment.contentId,
          checksum: attachment.checksum,
          metadata: (attachment.metadata ?? { metadataOnly: true }) as Prisma.InputJsonValue,
        },
      });
      await this.appendTimelineEvent(tx, orgId, runData.ticketId, AgentEventType.CHANNEL_ATTACHMENT_RECORDED, {
        externalMessageId: externalMessage.id,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        status: 'METADATA_ONLY',
      });
    }

    await tx.conversation.update({
      where: { id: conversation.id },
      data: {
        ticketId: runData.ticketId,
        externalCustomerId: customer.id,
        lastMessageAt: event.receivedAt,
        status: ConversationStatus.OPEN,
      },
    });
    await tx.channelConnection.update({
      where: { id: connection.id },
      data: {
        status: ChannelConnectionStatus.ACTIVE,
        lastSuccessfulEventAt: new Date(),
        lastErrorAt: null,
        lastErrorCode: null,
        lastErrorRedacted: null,
      },
    });
    await tx.webhookReceipt.update({
      where: { id: receiptId },
      data: {
        status: WebhookReceiptStatus.PROCESSED,
        processedAt: new Date(),
      },
    });

    await this.appendTimelineEvent(tx, orgId, runData.ticketId, AgentEventType.CHANNEL_WEBHOOK_RECEIVED, {
      receiptId,
      providerEventId: event.providerEventId,
      provider: connection.provider,
    }, runData.runId);
    await this.appendTimelineEvent(tx, orgId, runData.ticketId, AgentEventType.CHANNEL_CUSTOMER_MATCHED, {
      externalCustomerId: customer.id,
      normalizedEmail,
    }, runData.runId);
    if (conversation.created) {
      this.metrics.incrementChannelConversationCreated(connection.provider);
      await this.appendTimelineEvent(tx, orgId, runData.ticketId, AgentEventType.CHANNEL_CONVERSATION_CREATED, {
        conversationId: conversation.id,
        externalThreadId: conversation.externalThreadId,
      }, runData.runId);
    }
    await this.appendTimelineEvent(tx, orgId, runData.ticketId, AgentEventType.CHANNEL_MESSAGE_RECEIVED, {
      externalMessageId: externalMessage.id,
      providerMessageId: event.providerMessageId,
    }, runData.runId);
    this.metrics.incrementChannelInboundMessage(connection.provider);
    if (isNewTicket) {
      this.metrics.incrementChannelTicketCreated(connection.provider);
      await this.appendTimelineEvent(tx, orgId, runData.ticketId, AgentEventType.CHANNEL_TICKET_CREATED, {
        conversationId: conversation.id,
      }, runData.runId);
    }

    return {
      response: {
        ok: true,
        receiptId,
        ticketId: runData.ticketId,
        conversationId: conversation.id,
        externalMessageId: externalMessage.id,
      },
      dispatchId: runData.dispatchId,
    };
  }

  private async processDeliveryCallback(
    tx: Prisma.TransactionClient,
    connection: { id: string; organizationId: string; provider: ChannelProvider },
    receiptId: string,
    parsed: Extract<ParsedChannelEvent, { kind: 'delivery_callback' }>,
  ) {
    const callback = parsed.callback;
    const outbound = await tx.outboundMessage.findFirst({
      where: {
        channelConnectionId: connection.id,
        providerMessageId: callback.providerMessageId,
      },
    });

    if (!outbound) {
      await tx.webhookReceipt.update({
        where: { id: receiptId },
        data: {
          status: WebhookReceiptStatus.PROCESSED,
          processedAt: new Date(),
          metadata: { unknownProviderMessageId: callback.providerMessageId },
        },
      });
      return {
        response: { ok: true, ignored: true, reason: 'unknown_provider_message' },
        run: null,
      };
    }

    const delivered = callback.status === 'delivered';
    const failed = ['bounced', 'rejected', 'failed'].includes(callback.status);
    const nextStatus = delivered
      ? OutboundMessageStatus.DELIVERED
      : failed
        ? OutboundMessageStatus.FAILED
        : OutboundMessageStatus.SENT;
    const isAlreadyDelivered = outbound.status === OutboundMessageStatus.DELIVERED;
    const isDuplicateSent =
      outbound.status === OutboundMessageStatus.SENT && nextStatus === OutboundMessageStatus.SENT;

    if (isAlreadyDelivered || isDuplicateSent) {
      await tx.webhookReceipt.update({
        where: { id: receiptId },
        data: {
          status: WebhookReceiptStatus.PROCESSED,
          processedAt: new Date(),
          metadata: {
            ignoredCallbackStatus: callback.status,
            currentOutboundStatus: outbound.status,
          },
        },
      });
      return {
        response: {
          ok: true,
          ignored: true,
          reason: 'terminal_or_duplicate_callback',
          outboundMessageId: outbound.id,
          status: outbound.status,
        },
        run: null,
      };
    }

    await tx.outboundMessage.update({
      where: { id: outbound.id },
      data: {
        status: nextStatus,
        deliveredAt: delivered ? callback.occurredAt : outbound.deliveredAt,
        failedAt: failed ? callback.occurredAt : outbound.failedAt,
        lastErrorCode: failed ? callback.status.toUpperCase() : null,
        lastErrorRedacted: failed ? `Provider callback: ${callback.status}` : null,
      },
    });

    await tx.webhookReceipt.update({
      where: { id: receiptId },
      data: {
        status: WebhookReceiptStatus.PROCESSED,
        processedAt: new Date(),
      },
    });

    await this.appendTimelineEvent(
      tx,
      connection.organizationId,
      outbound.ticketId,
      delivered
        ? AgentEventType.CHANNEL_MESSAGE_DELIVERED
        : failed
          ? AgentEventType.CHANNEL_MESSAGE_FAILED
          : AgentEventType.CHANNEL_MESSAGE_SENT,
      {
        outboundMessageId: outbound.id,
        providerMessageId: callback.providerMessageId,
        status: callback.status,
      },
    );

    return {
      response: {
        ok: true,
        outboundMessageId: outbound.id,
        status: nextStatus,
      },
      run: null,
    };
  }

  private async upsertExternalCustomer(
    tx: Prisma.TransactionClient,
    input: {
      orgId: string;
      channelConnectionId: string;
      externalCustomerId?: string;
      email?: string;
      normalizedEmail: string | null;
      displayName?: string;
    },
  ) {
    if (input.externalCustomerId) {
      return tx.externalCustomer.upsert({
        where: {
          organizationId_channelConnectionId_externalCustomerId: {
            organizationId: input.orgId,
            channelConnectionId: input.channelConnectionId,
            externalCustomerId: input.externalCustomerId,
          },
        },
        update: {
          email: input.email,
          normalizedEmail: input.normalizedEmail,
          displayName: input.displayName,
        },
        create: {
          organizationId: input.orgId,
          channelConnectionId: input.channelConnectionId,
          externalCustomerId: input.externalCustomerId,
          email: input.email,
          normalizedEmail: input.normalizedEmail,
          displayName: input.displayName,
        },
      });
    }

    if (input.normalizedEmail) {
      return tx.externalCustomer.upsert({
        where: {
          organizationId_channelConnectionId_normalizedEmail: {
            organizationId: input.orgId,
            channelConnectionId: input.channelConnectionId,
            normalizedEmail: input.normalizedEmail,
          },
        },
        update: {
          email: input.email,
          displayName: input.displayName,
        },
        create: {
          organizationId: input.orgId,
          channelConnectionId: input.channelConnectionId,
          email: input.email,
          normalizedEmail: input.normalizedEmail,
          displayName: input.displayName,
        },
      });
    }

    return tx.externalCustomer.create({
      data: {
        organizationId: input.orgId,
        channelConnectionId: input.channelConnectionId,
        displayName: input.displayName,
      },
    });
  }

  private async findOrCreateConversation(
    tx: Prisma.TransactionClient,
    input: {
      orgId: string;
      channelConnectionId: string;
      customerId: string;
      providerThreadId?: string;
      providerMessageId?: string;
      inReplyTo?: string;
      references: string[];
      subject?: string;
    },
  ) {
    if (input.providerThreadId) {
      const existing = await tx.conversation.findFirst({
        where: {
          organizationId: input.orgId,
          channelConnectionId: input.channelConnectionId,
          externalThreadId: input.providerThreadId,
        },
      });
      if (existing) {
        return { ...existing, created: false };
      }

      const created = await tx.conversation.create({
        data: {
          organizationId: input.orgId,
          channelConnectionId: input.channelConnectionId,
          externalCustomerId: input.customerId,
          externalThreadId: input.providerThreadId,
          subject: input.subject,
        },
      });
      return { ...created, created: true };
    }

    for (const providerMessageId of [
      input.inReplyTo,
      ...input.references,
    ].filter(Boolean) as string[]) {
      const message = await tx.externalMessage.findFirst({
        where: {
          channelConnectionId: input.channelConnectionId,
          providerMessageId,
        },
        include: { conversation: true },
      });
      if (message) {
        return { ...message.conversation, created: false };
      }
    }

    const created = await tx.conversation.create({
      data: {
        organizationId: input.orgId,
        channelConnectionId: input.channelConnectionId,
        externalCustomerId: input.customerId,
        externalThreadId: input.providerMessageId
          ? `message:${input.providerMessageId}`
          : undefined,
        subject: input.subject,
      },
    });
    return { ...created, created: true };
  }

  private async ensureTicketAndRun(
    tx: Prisma.TransactionClient,
    input: {
      orgId: string;
      conversationId: string;
      webhookReceiptId: string;
      ticketId?: string | null;
      subject: string;
      body: string;
      customerEmail: string;
      customerName?: string;
    },
  ) {
    const queuedAt = new Date();
    if (input.ticketId) {
      await tx.ticketMessage.create({
        data: {
          orgId: input.orgId,
          ticketId: input.ticketId,
          body: input.body,
          direction: MessageDirection.INBOUND,
          status: MessageStatus.RECEIVED,
        },
      });
      await tx.ticket.update({
        where: { id: input.ticketId },
        data: { status: TicketStatus.OPEN },
      });
      const run = await tx.agentRun.create({
        data: {
          orgId: input.orgId,
          ticketId: input.ticketId,
          status: AgentRunStatus.QUEUED,
          trigger: AgentRunTrigger.TICKET_CREATED,
          correlationId: getCorrelationContext()?.correlationId ?? null,
          queuedAt,
        },
      });
      await this.appendTimelineEvent(tx, input.orgId, input.ticketId, AgentEventType.RUN_QUEUED, {
        actorType: 'SYSTEM',
        source: 'channel',
      }, run.id);
      const dispatch = await tx.inboundDispatch.upsert({
        where: { idempotencyKey: `inbound-run:${run.id}:support:v1` },
        update: {},
        create: {
          organizationId: input.orgId,
          ticketId: input.ticketId,
          runId: run.id,
          webhookReceiptId: input.webhookReceiptId,
          idempotencyKey: `inbound-run:${run.id}:support:v1`,
          payload: {
            orgId: input.orgId,
            runId: run.id,
            ticketId: input.ticketId,
            subject: input.subject,
            body: input.body,
            customerEmail: input.customerEmail,
            correlationId: run.correlationId,
            triggerType: AgentRunTrigger.TICKET_CREATED,
            enqueuedAt: queuedAt.toISOString(),
          },
        },
      });
      return {
        orgId: input.orgId,
        runId: run.id,
        ticketId: input.ticketId,
        subject: input.subject,
        body: input.body,
        customerEmail: input.customerEmail,
        correlationId: run.correlationId,
        queuedAt,
        dispatchId: dispatch.id,
      };
    }

    const ticket = await tx.ticket.create({
      data: {
        orgId: input.orgId,
        subject: sanitizeSubject(input.subject),
        status: TicketStatus.OPEN,
        priority: TicketPriority.NORMAL,
        customerEmail: input.customerEmail,
        customerName: input.customerName,
        messages: {
          create: {
            orgId: input.orgId,
            direction: MessageDirection.INBOUND,
            status: MessageStatus.RECEIVED,
            body: input.body,
          },
        },
      },
    });
    const run = await tx.agentRun.create({
      data: {
        orgId: input.orgId,
        ticketId: ticket.id,
        status: AgentRunStatus.QUEUED,
        trigger: AgentRunTrigger.TICKET_CREATED,
        correlationId: getCorrelationContext()?.correlationId ?? null,
        queuedAt,
      },
    });
    await tx.conversation.update({
      where: { id: input.conversationId },
      data: { ticketId: ticket.id },
    });
    await this.appendTimelineEvent(tx, input.orgId, ticket.id, AgentEventType.RUN_QUEUED, {
      actorType: 'SYSTEM',
      source: 'channel',
    }, run.id);
    const dispatch = await tx.inboundDispatch.upsert({
      where: { idempotencyKey: `inbound-run:${run.id}:support:v1` },
      update: {},
      create: {
        organizationId: input.orgId,
        ticketId: ticket.id,
        runId: run.id,
        webhookReceiptId: input.webhookReceiptId,
        idempotencyKey: `inbound-run:${run.id}:support:v1`,
        payload: {
          orgId: input.orgId,
          runId: run.id,
          ticketId: ticket.id,
          subject: ticket.subject,
          body: input.body,
          customerEmail: input.customerEmail,
          correlationId: run.correlationId,
          triggerType: AgentRunTrigger.TICKET_CREATED,
          enqueuedAt: queuedAt.toISOString(),
        },
      },
    });

    return {
      orgId: input.orgId,
      runId: run.id,
      ticketId: ticket.id,
      subject: ticket.subject,
      body: input.body,
      customerEmail: input.customerEmail,
      correlationId: run.correlationId,
      queuedAt,
      dispatchId: dispatch.id,
    };
  }

  private async enqueueSupportRun(run: {
    orgId: string;
    runId: string;
    ticketId: string;
    subject: string;
    body: string;
    customerEmail: string;
    correlationId?: string | null;
    queuedAt: Date;
  }) {
    await withQueueEnqueueTimeout(
      this.supportQueue.add(
        'ticket.process',
        {
          orgId: run.orgId,
          runId: run.runId,
          ticketId: run.ticketId,
          subject: run.subject,
          body: run.body,
          customerEmail: run.customerEmail,
          correlationId: run.correlationId,
          triggerType: AgentRunTrigger.TICKET_CREATED,
          enqueuedAt: run.queuedAt.toISOString(),
        },
        { jobId: `support-${run.runId}` },
      ),
    );
  }

  private async recordRejectedVerifiedReceipt(input: {
    connection: {
      id: string;
      organizationId: string;
      provider: ChannelProvider;
    };
    providerEventId: string;
    eventType: string;
    payloadHash: string;
    failureCode: string;
    failureMessageRedacted: string;
    correlationId?: string | null;
  }) {
    await this.prisma.webhookReceipt.create({
      data: {
        organizationId: input.connection.organizationId,
        channelConnectionId: input.connection.id,
        provider: input.connection.provider,
        providerEventId: input.providerEventId,
        eventType: input.eventType,
        signatureVerified: true,
        payloadHash: input.payloadHash,
        status: WebhookReceiptStatus.REJECTED,
        failureCode: input.failureCode,
        failureMessageRedacted: input.failureMessageRedacted,
        correlationId: input.correlationId,
      },
    }).catch(() => undefined);
  }

  private async appendTimelineEvent(
    tx: Prisma.TransactionClient,
    orgId: string,
    ticketId: string,
    type: AgentEventType,
    payload: Prisma.InputJsonValue,
    runId?: string,
  ) {
    const sequence = await nextEventSequence(tx, orgId, ticketId);

    await tx.agentEvent.create({
      data: {
        orgId,
        ticketId,
        runId,
        correlationId: getCorrelationContext()?.correlationId ?? null,
        type,
        sequence,
        payload,
      },
    });
  }

  private getProvider(providerName: ChannelProvider) {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new BadRequestException(`Unsupported channel provider ${providerName}`);
    }
    return provider;
  }

  private async recordChannelAudit(input: {
    orgId: string;
    actorUserId?: string;
    action: string;
    targetId: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    await this.prisma.channelAuditEvent.create({
      data: {
        organizationId: input.orgId,
        actorUserId: input.actorUserId,
        action: input.action,
        targetType: 'ChannelConnection',
        targetId: input.targetId,
        correlationId: getCorrelationContext()?.correlationId ?? null,
        metadata: input.metadata,
      },
    });
  }

  private toSafeConnection(connection: {
    id: string;
    publicId: string;
    provider: ChannelProvider;
    displayName: string;
    status: ChannelConnectionStatus;
    externalAccountId: string | null;
    inboundAddress: string | null;
    config: Prisma.JsonValue | null;
    isDefault: boolean;
    lastSuccessfulEventAt: Date | null;
    lastErrorAt: Date | null;
    lastErrorCode: string | null;
    lastErrorRedacted: string | null;
    createdAt: Date;
    updatedAt: Date;
    disabledAt: Date | null;
  }) {
    return {
      id: connection.id,
      publicId: connection.publicId,
      provider: connection.provider,
      displayName: connection.displayName,
      status: connection.status,
      externalAccountId: connection.externalAccountId,
      inboundAddress: connection.inboundAddress,
      config: sanitizeForLog(connection.config),
      isDefault: connection.isDefault,
      lastSuccessfulEventAt: connection.lastSuccessfulEventAt,
      lastErrorAt: connection.lastErrorAt,
      lastErrorCode: connection.lastErrorCode,
      lastErrorRedacted: connection.lastErrorRedacted,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
      disabledAt: connection.disabledAt,
    };
  }
}
