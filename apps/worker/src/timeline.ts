import Redis from 'ioredis';

export const redis = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
});

export async function appendTimelineEvent(params: {
  orgId: string;
  ticketId: string;
  type: string;
  payload: unknown;
}) {
  const key = `timeline:${params.orgId}:${params.ticketId}`;
  const event = {
    ts: new Date().toISOString(),
    type: params.type,
    payload: params.payload,
  };

  await redis.rpush(key, JSON.stringify(event));
  // keep last 200 events to avoid infinite growth in this phase
  await redis.ltrim(key, -200, -1);
}
