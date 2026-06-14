import { Prisma } from '@prisma/client';

export async function nextEventSequence(
  tx: Prisma.TransactionClient,
  orgId: string,
  ticketId: string,
): Promise<number> {
  const max = await tx.agentEvent.aggregate({
    where: { orgId, ticketId },
    _max: { sequence: true },
  });
  return (max._max.sequence ?? 0) + 1;
}
