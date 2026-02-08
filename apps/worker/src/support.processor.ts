import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { appendTimelineEvent } from './timeline';

@Processor('support')
export class SupportProcessor extends WorkerHost {
  async process(job: Job) {
    if (job.name === 'ticket.process') {
      const { orgId, ticketId, subject } = job.data;

      await appendTimelineEvent({
        orgId,
        ticketId,
        type: 'RUN_STARTED',
        payload: { jobId: job.id, subject },
      });

      console.log(`[worker] processing ticket ${ticketId} for org ${orgId}`);
      console.log(`[worker] subject: ${subject}`);

      await appendTimelineEvent({
        orgId,
        ticketId,
        type: 'ROUTER_DECISION',
        payload: { action: 'DRAFT_FOR_HUMAN', confidence: 0.62, reason: 'stubbed' },
      });

      await appendTimelineEvent({
        orgId,
        ticketId,
        type: 'RUN_FINISHED',
        payload: { status: 'SUCCEEDED' },
      });

      return { ok: true };
    }

    if (job.name === 'hello') {
      console.log(`[worker] got job ${job.id}:`, job.data);
      return { ok: true };
    }

    return { ok: true, ignored: true };
  }
}
