function parseInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value?.trim() ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export const SUPPORT_QUEUE_NAME = 'support';
export const SUPPORT_DEAD_LETTER_QUEUE_NAME = 'support-dead-letter';

export function getQueueConnection() {
  return {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInteger(process.env.REDIS_PORT, 6379),
  };
}

export function getQueueDefaults() {
  return {
    attempts: Math.max(parseInteger(process.env.QUEUE_JOB_ATTEMPTS, 3), 1),
    backoffBaseMs: Math.max(
      parseInteger(process.env.QUEUE_BACKOFF_BASE_MS, 1000),
      100,
    ),
    removeOnCompleteCount: Math.max(
      parseInteger(process.env.QUEUE_REMOVE_ON_COMPLETE_COUNT, 100),
      1,
    ),
    removeOnFailCount: Math.max(
      parseInteger(process.env.QUEUE_REMOVE_ON_FAIL_COUNT, 200),
      1,
    ),
    stalledIntervalMs: Math.max(
      parseInteger(process.env.QUEUE_STALLED_INTERVAL_MS, 30_000),
      5000,
    ),
    maxStalledCount: Math.max(
      parseInteger(process.env.QUEUE_MAX_STALLED_COUNT, 1),
      0,
    ),
  };
}
