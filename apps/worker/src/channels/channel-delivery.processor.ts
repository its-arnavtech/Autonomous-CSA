import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import {
  AgentEventType,
  ChannelConnectionStatus,
  ChannelProvider,
  DeliveryAttemptOutcome,
  ExternalMessageDirection,
  OutboundMessageStatus,
  Prisma,
  nextEventSequence,
} from '@agentic-support/db';
import {
  getCorrelationContext,
  sanitizeForLog,
  runWithCorrelationContext,
} from '@agentic-support/observability';
import { PrismaService } from '../prisma.service';
import { workerLogger } from '../observability/worker-logger';
import { CHANNEL_DELIVERY_QUEUE_NAME } from '../queue/queue.config';
import { MockEmailProvider } from './mock-email.provider';

type DeliveryJob = {
  outboundMessageId: string;
  correlationId?: string | null;
};

const TERMINAL_STATUSES = new Set<OutboundMessageStatus>([
  OutboundMessageStatus.SENT,
  OutboundMessageStatus.DELIVERED,
  OutboundMessageStatus.CANCELLED,
  OutboundMessageStatus.DEAD_LETTER,
]);

function parseIntEnv(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name]?.trim() ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function backoffDelayMs(attempt: number) {
  const base = Math.max(parseIntEnv('CHANNEL_DELIVERY_RETRY_BASE_DELAY_MS', 1000), 100);
  const capped = Math.min(base * 2 ** Math.max(attempt - 1, 0), 60_000);
  const jitter = Math.floor(capped * 0.2);
  return capped + jitter;
}

@Processor(CHANNEL_DELIVERY_QUEUE_NAME)
export class ChannelDeliveryProcessor extends WorkerHost {
  private readonly mockProvider = new MockEmailProvider();

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(CHANNEL_DELIVERY_QUEUE_NAME)
    private readonly deliveryQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<DeliveryJob>) {
    if (job.name !== 'send-outbound-message') {
      return { ok: true, ignored: true };
    }

    const correlationId =
      job.data.correlationId ??
      getCorrelationContext()?.correlationId ??
      `channel-delivery-${String(job.id)}`;

    return runWithCorrelationContext(
      {
        correlationId,
        requestId: correlationId,
        jobId: String(job.id),
        jobName: job.name,
      },
      () => this.sendOutboundMessage(job, correlationId),
    );
  }

  private async sendOutboundMessage(job: Job<DeliveryJob>, correlationId: string) {
    const outbound = await this.prisma.outboundMessage.findUnique({
      where: { id: job.data.outboundMessageId },
      include: {
        channelConnection: true,
        conversation: true,
      },
    });

    if (!outbound) {
      return { ok: true, skipped: true, reason: 'missing_outbound_message' };
    }

    if (TERMINAL_STATUSES.has(outbound.status)) {
      return { ok: true, skipped: true, status: outbound.status };
    }

    const now = new Date();
    if (outbound.nextAttemptAt && outbound.nextAttemptAt > now) {
      await this.enqueue(outbound.id, outbound.nextAttemptAt.getTime() - now.getTime());
      return { ok: true, delayed: true };
    }

    const leaseMs = Math.max(parseIntEnv('CHANNEL_DELIVERY_LEASE_MS', 120_000), 10_000);
    const nextAttemptNumber = outbound.attemptCount + 1;
    const claimed = await this.prisma.outboundMessage.updateMany({
      where: {
        id: outbound.id,
        status: {
          in: [
            OutboundMessageStatus.PENDING,
            OutboundMessageStatus.RETRY_SCHEDULED,
            OutboundMessageStatus.FAILED,
            OutboundMessageStatus.PROCESSING,
          ],
        },
        OR: [
          { leaseExpiresAt: null },
          { leaseExpiresAt: { lt: now } },
          { status: { not: OutboundMessageStatus.PROCESSING } },
        ],
      },
      data: {
        status: OutboundMessageStatus.PROCESSING,
        processingStartedAt: now,
        leaseOwner: String(job.id),
        leaseExpiresAt: new Date(now.getTime() + leaseMs),
        attemptCount: nextAttemptNumber,
      },
    });

    if (claimed.count !== 1) {
      return { ok: true, skipped: true, reason: 'already_claimed' };
    }

    const attempt = await this.prisma.deliveryAttempt.create({
      data: {
        organizationId: outbound.organizationId,
        outboundMessageId: outbound.id,
        attemptNumber: nextAttemptNumber,
        outcome: DeliveryAttemptOutcome.UNKNOWN,
        correlationId,
      },
    });
    await this.appendTimelineEvent(
      outbound.organizationId,
      outbound.ticketId,
      AgentEventType.CHANNEL_DELIVERY_ATTEMPT_STARTED,
      {
        outboundMessageId: outbound.id,
        attemptNumber: nextAttemptNumber,
      },
    );

    try {
      if (outbound.channelConnection.status !== ChannelConnectionStatus.ACTIVE) {
        throw Object.assign(new Error('Channel connection is disabled'), {
          category: 'CONNECTION_DISABLED',
          retryable: false,
        });
      }
      if (outbound.channelConnection.provider !== ChannelProvider.MOCK_EMAIL) {
        throw Object.assign(new Error('Unsupported channel provider'), {
          category: 'CONFIGURATION_ERROR',
          retryable: false,
        });
      }

      const result = await this.mockProvider.sendMessage({
        idempotencyKey: outbound.idempotencyKey,
        subject: outbound.subject,
        textBody: outbound.textBody,
        htmlBody: outbound.htmlBody,
        recipients: outbound.recipients as Array<{
          email?: string;
          name?: string;
          externalId?: string;
        }>,
        conversation: {
          externalThreadId: outbound.conversation.externalThreadId,
        },
        failureMode:
          (outbound.channelConnection.config as { failureMode?: string } | null)
            ?.failureMode ?? null,
      });

      await this.prisma.$transaction(async (tx) => {
        const externalMessage = await tx.externalMessage.create({
          data: {
            organizationId: outbound.organizationId,
            conversationId: outbound.conversationId,
            channelConnectionId: outbound.channelConnectionId,
            providerMessageId: result.providerMessageId,
            direction: ExternalMessageDirection.OUTBOUND,
            sender: { type: 'support' },
            recipients: outbound.recipients as Prisma.InputJsonValue,
            subject: outbound.subject,
            textBody: outbound.textBody,
            htmlBody: outbound.htmlBody,
            sentAt: result.acceptedAt,
            metadata: (result.metadata ?? {}) as Prisma.InputJsonValue,
          },
        });
        await tx.outboundMessage.update({
          where: { id: outbound.id },
          data: {
            externalMessageId: externalMessage.id,
            providerMessageId: result.providerMessageId,
            status:
              result.deliveryStatus === 'DELIVERED'
                ? OutboundMessageStatus.DELIVERED
                : OutboundMessageStatus.SENT,
            sentAt: result.acceptedAt,
            deliveredAt:
              result.deliveryStatus === 'DELIVERED' ? result.acceptedAt : null,
            leaseOwner: null,
            leaseExpiresAt: null,
            nextAttemptAt: null,
            lastErrorCode: null,
            lastErrorRedacted: null,
          },
        });
        await tx.deliveryAttempt.update({
          where: { id: attempt.id },
          data: {
            outcome: DeliveryAttemptOutcome.SUCCEEDED,
            completedAt: new Date(),
            retryable: false,
            responseMetadata: (result.metadata ?? {}) as Prisma.InputJsonValue,
          },
        });
      });

      await this.appendTimelineEvent(
        outbound.organizationId,
        outbound.ticketId,
        AgentEventType.CHANNEL_MESSAGE_SENT,
        {
          outboundMessageId: outbound.id,
          providerMessageId: result.providerMessageId,
          attemptNumber: nextAttemptNumber,
        },
      );
      if (result.deliveryStatus === 'DELIVERED') {
        await this.appendTimelineEvent(
          outbound.organizationId,
          outbound.ticketId,
          AgentEventType.CHANNEL_MESSAGE_DELIVERED,
          {
            outboundMessageId: outbound.id,
            providerMessageId: result.providerMessageId,
            attemptNumber: nextAttemptNumber,
          },
        );
      }

      workerLogger.info('Channel outbound message sent', {
        outboundMessageId: outbound.id,
        provider: outbound.channelConnection.provider,
        attemptNumber: nextAttemptNumber,
        correlationId,
      });

      return { ok: true, status: result.deliveryStatus };
    } catch (error) {
      const classified = this.mockProvider.classifyError(error);
      const canRetry =
        classified.retryable && nextAttemptNumber < outbound.maxAttempts;
      const nextAttemptAt = canRetry
        ? new Date(Date.now() + backoffDelayMs(nextAttemptNumber))
        : null;
      const nextStatus = canRetry
        ? OutboundMessageStatus.RETRY_SCHEDULED
        : OutboundMessageStatus.DEAD_LETTER;

      await this.prisma.$transaction(async (tx) => {
        await tx.deliveryAttempt.update({
          where: { id: attempt.id },
          data: {
            outcome: canRetry
              ? DeliveryAttemptOutcome.RETRYABLE_FAILURE
              : DeliveryAttemptOutcome.PERMANENT_FAILURE,
            completedAt: new Date(),
            providerStatusCode: classified.providerStatusCode,
            providerErrorCode: classified.providerErrorCode ?? classified.category,
            retryable: canRetry,
            errorRedacted: classified.message,
          },
        });
        await tx.outboundMessage.update({
          where: { id: outbound.id },
          data: {
            status: nextStatus,
            failedAt: canRetry ? null : new Date(),
            nextAttemptAt,
            leaseOwner: null,
            leaseExpiresAt: null,
            lastErrorCode: classified.category,
            lastErrorRedacted: classified.message,
          },
        });
        if (!canRetry) {
          await tx.operationalFailure.create({
            data: {
              organizationId: outbound.organizationId,
              queueName: CHANNEL_DELIVERY_QUEUE_NAME,
              jobName: job.name,
              jobId: String(job.id),
              correlationId,
              ticketId: outbound.ticketId,
              errorCode: classified.category,
              safeErrorMessage: classified.message,
              attemptCount: nextAttemptNumber,
              payloadSummaryJson: sanitizeForLog({
                outboundMessageId: outbound.id,
              }) as Prisma.InputJsonValue,
            },
          });
        }
      });

      await this.appendTimelineEvent(
        outbound.organizationId,
        outbound.ticketId,
        canRetry
          ? AgentEventType.CHANNEL_DELIVERY_RETRY_SCHEDULED
          : AgentEventType.CHANNEL_MESSAGE_DEAD_LETTERED,
        {
          outboundMessageId: outbound.id,
          attemptNumber: nextAttemptNumber,
          errorCode: classified.category,
          retryable: canRetry,
          nextAttemptAt,
        },
      );

      if (canRetry && nextAttemptAt) {
        await this.enqueue(outbound.id, nextAttemptAt.getTime() - Date.now());
      }

      workerLogger.warn('Channel outbound message delivery failed', {
        outboundMessageId: outbound.id,
        attemptNumber: nextAttemptNumber,
        errorCode: classified.category,
        retryable: canRetry,
        correlationId,
      });

      return { ok: true, status: nextStatus, retryable: canRetry };
    }
  }

  private async enqueue(outboundMessageId: string, delayMs: number) {
    await this.deliveryQueue.add(
      'send-outbound-message',
      { outboundMessageId },
      {
        jobId: `channel-delivery-${outboundMessageId}-${Date.now()}`,
        delay: Math.max(delayMs, 0),
      },
    );
  }

  private async appendTimelineEvent(
    orgId: string,
    ticketId: string,
    type: AgentEventType,
    payload: Prisma.InputJsonValue,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const sequence = await nextEventSequence(tx, orgId, ticketId);
      await tx.agentEvent.create({
        data: {
          orgId,
          ticketId,
          type,
          sequence,
          correlationId: getCorrelationContext()?.correlationId ?? null,
          payload,
        },
      });
    });
  }
}
