import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('tickets')
export class TicketsTimelineController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':id/timeline')
  async getTimeline(@Param('id') ticketId: string, @Query('orgId') orgId: string) {
    const orgSlug = orgId ?? 'org_demo';
    const organization = await this.prisma.organization.findUnique({
      where: { slug: orgSlug },
    });

    if (!organization) {
      throw new BadRequestException(`Unknown organization: ${orgSlug}`);
    }

    const events = await this.prisma.agentEvent.findMany({
      where: { orgId: organization.id, ticketId },
      orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }],
    });

    return events.map((event) => ({
      ts: event.createdAt.toISOString(),
      type: event.type,
      payload: event.payload,
    }));
  }
}
