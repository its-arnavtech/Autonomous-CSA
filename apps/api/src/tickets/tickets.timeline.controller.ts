import { Controller, Get, Param, Query } from '@nestjs/common';
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
});

@Controller('tickets')
export class TicketsTimelineController {
  @Get(':id/timeline')
  async getTimeline(@Param('id') ticketId: string, @Query('orgId') orgId: string) {
    if (!orgId) return { error: 'orgId is required' };

    const key = `timeline:${orgId}:${ticketId}`;
    const items = await redis.lrange(key, 0, -1);
    return items.map((s) => JSON.parse(s));
  }
}
