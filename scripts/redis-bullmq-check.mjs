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

function connection() {
  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  });
}

async function main() {
  const redis = connection();
  await redis.connect();

  const luaResult = await redis.eval('return redis.call("PING")', 0);
  if (luaResult !== 'PONG') {
    throw new Error('Lua script check failed');
  }

  const multiResult = await redis
    .multi()
    .set(`${prefix}:multi`, 'ok')
    .get(`${prefix}:multi`)
    .exec();
  if (multiResult?.[1]?.[1] !== 'ok') {
    throw new Error('Redis transaction check failed');
  }

  await redis.set(`${prefix}:expires`, 'ok', 'EX', 1);
  await new Promise((resolve) => setTimeout(resolve, 1250));
  if ((await redis.get(`${prefix}:expires`)) !== null) {
    throw new Error('Redis key expiry check failed');
  }

  const streamId = await redis.xadd(`${prefix}:stream`, '*', 'event', 'ok');
  const streamRead = await redis.xread('COUNT', 1, 'STREAMS', `${prefix}:stream`, '0-0');
  if (!streamId || !streamRead) {
    throw new Error('Redis stream check failed');
  }

  const queue = new Queue(queueName, {
    connection: connection(),
    prefix,
  });
  const queueEvents = new QueueEvents(queueName, {
    connection: connection(),
    prefix,
  });
  await queueEvents.waitUntilReady();

  const worker = new Worker(
    queueName,
    async (job) => ({ received: job.data.kind }),
    {
      connection: connection(),
      prefix,
    },
  );
  await worker.waitUntilReady();

  const immediateJob = await queue.add('immediate', { kind: 'immediate' });
  const immediateResult = await immediateJob.waitUntilFinished(queueEvents, 10_000);
  if (immediateResult.received !== 'immediate') {
    throw new Error('BullMQ immediate job check failed');
  }

  const completed = once(queueEvents, 'completed');
  await queue.add('delayed', { kind: 'delayed' }, { delay: 250 });
  await Promise.race([
    completed,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('BullMQ delayed job timed out')), 10_000),
    ),
  ]);

  redis.disconnect();
  const reconnect = connection();
  await reconnect.connect();
  await reconnect.ping();

  await worker.close();
  await queueEvents.close();
  await queue.obliterate({ force: true });
  await queue.close();
  await reconnect.del(`${prefix}:multi`, `${prefix}:stream`);
  await reconnect.quit();

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
}

main().catch((error) => {
  console.error(JSON.stringify({
    event: 'redis.bullmq.compatibility.failed',
    error: error instanceof Error ? error.message : 'unknown error',
  }));
  process.exit(1);
});
