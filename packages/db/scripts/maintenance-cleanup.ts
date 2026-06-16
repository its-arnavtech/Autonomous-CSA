import { PrismaClient } from '@prisma/client';

type CleanupSummary = {
  refreshSessions: number;
  operationalFailures: number;
  agentEvents: number;
};

function parseIntegerEnv(name: string, defaultValue: number) {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return defaultValue;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }

  return parsed;
}

function getCutoffDate(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function deleteInBatches(params: {
  modelName: keyof PrismaClient;
  selectIds: () => Promise<string[]>;
  deleteMany: (ids: string[]) => Promise<number>;
  dryRun: boolean;
}) {
  let total = 0;

  for (;;) {
    const ids = await params.selectIds();
    if (ids.length === 0) {
      return total;
    }

    total += ids.length;

    if (!params.dryRun) {
      await params.deleteMany(ids);
    }
  }
}

async function main() {
  const prisma = new PrismaClient();
  const batchSize = parseIntegerEnv('RETENTION_BATCH_SIZE', 100);
  const dryRun =
    (process.env.RETENTION_DRY_RUN?.trim().toLowerCase() ?? 'true') !==
    'false';
  const refreshSessionDays = parseIntegerEnv(
    'RETENTION_REFRESH_SESSION_DAYS',
    30,
  );
  const operationalFailureDays = parseIntegerEnv(
    'RETENTION_OPERATIONAL_FAILURE_DAYS',
    30,
  );
  const agentEventDays = parseIntegerEnv('RETENTION_AGENT_EVENT_DAYS', 0);

  const summary: CleanupSummary = {
    refreshSessions: 0,
    operationalFailures: 0,
    agentEvents: 0,
  };

  try {
    summary.refreshSessions = await deleteInBatches({
      modelName: 'refreshSession',
      dryRun,
      selectIds: async () => {
        const rows = await prisma.refreshSession.findMany({
          where: {
            OR: [
              {
                expiresAt: {
                  lt: getCutoffDate(refreshSessionDays),
                },
              },
              {
                revokedAt: {
                  lt: getCutoffDate(refreshSessionDays),
                },
              },
            ],
          },
          orderBy: { createdAt: 'asc' },
          take: batchSize,
          select: { id: true },
        });

        return rows.map((row) => row.id);
      },
      deleteMany: async (ids) => {
        const result = await prisma.refreshSession.deleteMany({
          where: { id: { in: ids } },
        });
        return result.count;
      },
    });

    summary.operationalFailures = await deleteInBatches({
      modelName: 'operationalFailure',
      dryRun,
      selectIds: async () => {
        const rows = await prisma.operationalFailure.findMany({
          where: {
            resolvedAt: {
              lt: getCutoffDate(operationalFailureDays),
            },
          },
          orderBy: { failedAt: 'asc' },
          take: batchSize,
          select: { id: true },
        });

        return rows.map((row) => row.id);
      },
      deleteMany: async (ids) => {
        const result = await prisma.operationalFailure.deleteMany({
          where: { id: { in: ids } },
        });
        return result.count;
      },
    });

    if (agentEventDays > 0) {
      summary.agentEvents = await deleteInBatches({
        modelName: 'agentEvent',
        dryRun,
        selectIds: async () => {
          const rows = await prisma.agentEvent.findMany({
            where: {
              createdAt: {
                lt: getCutoffDate(agentEventDays),
              },
            },
            orderBy: { createdAt: 'asc' },
            take: batchSize,
            select: { id: true },
          });

          return rows.map((row) => row.id);
        },
        deleteMany: async (ids) => {
          const result = await prisma.agentEvent.deleteMany({
            where: { id: { in: ids } },
          });
          return result.count;
        },
      });
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          level: 'info',
          event: 'maintenance.cleanup.completed',
          dryRun,
          batchSize,
          summary,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown cleanup error';
  process.stderr.write(
    `${JSON.stringify(
      {
        level: 'error',
        event: 'maintenance.cleanup.failed',
        message,
      },
      null,
      2,
    )}\n`,
  );
  process.exit(1);
});
