#!/usr/bin/env node
import { once } from 'node:events';
import { Queue, QueueEvents, Worker } from 'bullmq';
import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL?.trim();
if (!redisUrl) {
  throw new Error('REDIS_URL is required');
}

const prefix = `staging-bullmq-check-${Date.now()}`;
const queueName = `${prefix}-queue`;
const stepTimeoutMs = 15_000;
const cleanupTimeoutMs = 5_000;

function withTimeout(label, promise, timeoutMs = stepTimeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs),
    ),
  ]);
}

async function step(name, fn) {
  await withTimeout(name, Promise.resolve().then(fn));
}

async function cleanup(name, fn) {
  await withTimeout(name, Promise.resolve().then(fn), cleanupTimeoutMs).catch(() => undefined);
}

function connection() {
  const redis = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  redis.on('error', () => {
    // Commands below surface real failures; this avoids noisy unhandled error events during teardown.
  });
  return redis;
}

async function main() {
  const redis = connection();
  let reconnect;
  let queue;
  let queueEvents;
  let worker;
  try {
    await step('lua', async () => {
      const luaResult = await redis.eval('return redis.call("PING")', 0);
      if (luaResult !== 'PONG') {
        throw new Error('Lua script check failed');
      }
    });

    await step('transactions', async () => {
      const multiResult = await redis
        .multi()
        .set(`${prefix}:multi`, 'ok')
        .get(`${prefix}:multi`)
        .exec();
      if (multiResult?.[1]?.[1] !== 'ok') {
        throw new Error('Redis transaction check failed');
      }
    });

    await step('key_expiry', async () => {
      await redis.set(`${prefix}:expires`, 'ok', 'EX', 1);
      await new Promise((resolve) => setTimeout(resolve, 1250));
      if ((await redis.get(`${prefix}:expires`)) !== null) {
        throw new Error('Redis key expiry check failed');
      }
    });

    await step('streams', async () => {
      const streamId = await redis.xadd(`${prefix}:stream`, '*', 'event', 'ok');
      const streamRead = await redis.xread('COUNT', 1, 'STREAMS', `${prefix}:stream`, '0-0');
      if (!streamId || !streamRead) {
        throw new Error('Redis stream check failed');
      }
    });

    await step('queue_events_ready', async () => {
      queue = new Queue(queueName, {
        connection: connection(),
        prefix,
      });
      queueEvents = new QueueEvents(queueName, {
        connection: connection(),
        prefix,
      });
      await queueEvents.waitUntilReady();
    });

    await step('worker_ready', async () => {
      worker = new Worker(
        queueName,
        async (job) => ({ received: job.data.kind }),
        {
          connection: connection(),
          prefix,
        },
      );
      await worker.waitUntilReady();
    });

    await step('immediate_job', async () => {
      const immediateJob = await queue.add('immediate', { kind: 'immediate' });
      const immediateResult = await immediateJob.waitUntilFinished(queueEvents, 10_000);
      if (immediateResult.received !== 'immediate') {
        throw new Error('BullMQ immediate job check failed');
      }
    });

    await step('delayed_job', async () => {
      const completed = once(queueEvents, 'completed');
      await queue.add('delayed', { kind: 'delayed' }, { delay: 250 });
      await Promise.race([
        completed,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('BullMQ delayed job timed out')), 10_000),
        ),
      ]);
    });

    await step('reconnect', async () => {
      reconnect = connection();
      await reconnect.ping();
    });

    console.log(JSON.stringify({
      event: 'redis.bullmq.compatibility.passed',
      queueName,
      checks: [
        'lua',
        'transactions',
        'key_expiry',
        'streams',
        'queue',
        'worker',
        'queue_events',
        'delayed_jobs',
        'reconnect',
      ],
    }));
  } finally {
    await cleanup('worker.close', () => worker?.close(true));
    await cleanup('queueEvents.close', () => queueEvents?.close());
    await cleanup('queue.obliterate', () => queue?.obliterate({ force: true }));
    await cleanup('queue.close', () => queue?.close());
    await cleanup('reconnect.del', () => reconnect?.del(`${prefix}:multi`, `${prefix}:stream`));
    await cleanup('reconnect.quit', () => reconnect?.quit());
    reconnect?.disconnect();
    await cleanup('redis.del', () => redis.del(`${prefix}:multi`, `${prefix}:stream`));
    await cleanup('redis.quit', () => redis.quit());
    redis.disconnect();
  }
}

main().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error(JSON.stringify({
    event: 'redis.bullmq.compatibility.failed',
    error: error instanceof Error ? error.message : 'unknown error',
  }));
  process.exit(1);
});
