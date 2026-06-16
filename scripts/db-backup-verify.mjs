import {
  assertTableExists,
  buildPostgresEnv,
  countTableRows,
  createTempDatabaseName,
  getPgRestoreCommand,
  getPsqlCommand,
  getWorkspacePrismaCommand,
  parseArgs,
  parseDatabaseUrl,
  runCommand,
  verifyChecksumFile,
  withDatabaseName,
} from './lib/postgres-tools.mjs';

const TABLES_TO_CHECK = ['Ticket', 'TicketMessage', 'AgentRun', 'AgentEvent'];

async function createTempDatabase(adminUrl, databaseName) {
  const env = buildPostgresEnv(adminUrl);
  await runCommand(
    getPsqlCommand(),
    ['-d', parseDatabaseUrl(adminUrl).databaseName, '-c', `CREATE DATABASE "${databaseName}"`],
    {
      env,
      executableName: 'psql',
      overrideEnvVar: 'PSQL_PATH',
    },
  );
}

async function dropTempDatabase(adminUrl, databaseName) {
  const env = buildPostgresEnv(adminUrl);
  await runCommand(
    getPsqlCommand(),
    [
      '-d',
      parseDatabaseUrl(adminUrl).databaseName,
      '-c',
      `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
    ],
    {
      env,
      executableName: 'psql',
      overrideEnvVar: 'PSQL_PATH',
    },
  );
}

async function restoreBackupIntoDatabase(backupPath, targetUrl) {
  const pgRestorePath = getPgRestoreCommand();

  await runCommand(
    pgRestorePath,
    [
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      '--dbname',
      parseDatabaseUrl(targetUrl).databaseName,
      backupPath,
    ],
    {
      env: buildPostgresEnv(targetUrl),
      executableName: 'pg_restore',
      overrideEnvVar: 'PG_RESTORE_PATH',
    },
  );
}

async function runPrismaValidation(databaseUrl) {
  await runCommand(
    getWorkspacePrismaCommand(),
    [
      'migrate',
      'status',
      '--schema',
      'prisma/schema.prisma',
    ],
    {
      cwd: 'C:\\Autonomous-CSA\\packages\\db',
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
      executableName: 'prisma',
      overrideEnvVar: 'PRISMA_PATH',
    },
  );
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const backupPath = positional[0];
  if (!backupPath) {
    throw new Error('Usage: node scripts/db-backup-verify.mjs <backup-file>');
  }

  const sourceDatabaseUrl =
    flags.get('source-database-url') ?? process.env.DATABASE_URL;
  if (!sourceDatabaseUrl) {
    throw new Error('DATABASE_URL or --source-database-url is required');
  }

  const adminDatabaseUrl =
    flags.get('admin-database-url') ??
    process.env.PG_ADMIN_DATABASE_URL ??
    withDatabaseName(sourceDatabaseUrl, 'postgres');
  const preserve = flags.get('preserve') === 'true';
  const tempDatabaseName = createTempDatabaseName();
  const tempDatabaseUrl = withDatabaseName(sourceDatabaseUrl, tempDatabaseName);

  await verifyChecksumFile(backupPath);
  await createTempDatabase(adminDatabaseUrl, tempDatabaseName);

  try {
    await restoreBackupIntoDatabase(backupPath, tempDatabaseUrl);
    await runPrismaValidation(tempDatabaseUrl);

    const counts = {};
    for (const tableName of TABLES_TO_CHECK) {
      await assertTableExists(tempDatabaseUrl, tableName);
      counts[tableName] = {
        source: await countTableRows(sourceDatabaseUrl, tableName),
        restored: await countTableRows(tempDatabaseUrl, tableName),
      };
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          event: 'db.backup.verify.completed',
          backupPath,
          tempDatabase: parseDatabaseUrl(tempDatabaseUrl).safeDisplay,
          counts,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    if (!preserve) {
      await dropTempDatabase(adminDatabaseUrl, tempDatabaseName);
    }
  }
}

void main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify(
      {
        event: 'db.backup.verify.failed',
        message: error instanceof Error ? error.message : 'Unknown verify error',
      },
      null,
      2,
    )}\n`,
  );
  process.exit(1);
});
