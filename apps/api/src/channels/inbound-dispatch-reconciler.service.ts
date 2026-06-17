import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { apiLogger } from '../observability/api-logger';
import { ChannelsService } from './channels.service';

function parseIntervalMs() {
  const parsed = Number.parseInt(
    process.env.CHANNEL_INBOUND_DISPATCH_POLL_INTERVAL_MS ?? '30000',
    10,
  );
  return Math.max(Number.isFinite(parsed) ? parsed : 30000, 5000);
}

@Injectable()
export class InboundDispatchReconcilerService
  implements OnModuleInit, OnModuleDestroy
{
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly intervalMs = parseIntervalMs();

  constructor(private readonly channelsService: ChannelsService) {}

  onModuleInit() {
    void this.reconcile('startup');
    this.timer = setInterval(() => {
      void this.reconcile('interval');
    }, this.intervalMs);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async reconcile(reason: string) {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      const results = await this.channelsService.dispatchPendingInbound();
      if (results.length > 0) {
        apiLogger.log('Inbound dispatch reconciled', {
          reason,
          count: results.length,
          completed: results.filter((result) => result.status === 'COMPLETED')
            .length,
        });
      }
    } catch (error) {
      apiLogger.warn('Inbound dispatch reconciliation failed', {
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.running = false;
    }
  }
}
