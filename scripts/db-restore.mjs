import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
  buildPostgresEnv,
  getPgRestoreCommand,
  isProductionLikeDatabase,
  parseArgs,
  parseDatabaseUrl,
  runCommand,
  verifyChecksumFile,
} from './lib/postgres-tools.mjs';

async function confirmRestore(targetUrl, backupPath) {
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(
      `Restore ${backupPath} into ${parseDatabaseUrl(targetUrl).safeDisplay}? Type "restore" to continue: `,
    );
    return answer.trim().toLowerCase() === 'restore';
  } finally {
    rl.close();
  }
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const backupPath = positional[0];
  if (!backupPath) {
    throw new Error('Usage: node scripts/db-restore.mjs <backup-file> --target-database-url=<url>');
  }

  const targetDatabaseUrl =
    flags.get('target-database-url') ?? process.env.TARGET_DATABASE_URL;
  if (!targetDatabaseUrl) {
    throw new Error('TARGET_DATABASE_URL or --target-database-url is required');
  }

  const yes = flags.get('yes') === 'true';
  const allowProduction = flags.get('allow-production') === 'true';
  if (isProductionLikeDatabase(targetDatabaseUrl) && !allowProduction) {
    throw new Error(
      'Refusing production-like restore without --allow-production=true',
    );
  }

  if (!yes) {
    const confirmed = await confirmRestore(targetDatabaseUrl, backupPath);
    if (!confirmed) {
      throw new Error('Restore aborted by operator');
    }
  }

  const checksum = await verifyChecksumFile(backupPath);
  const pgRestorePath =
    flags.get('pg-restore-path') ?? getPgRestoreCommand();

  await runCommand(
    pgRestorePath,
    ['--clean', '--if-exists', '--no-owner', '--no-privileges', '--dbname', parseDatabaseUrl(targetDatabaseUrl).databaseName, backupPath],
    {
      env: buildPostgresEnv(targetDatabaseUrl),
      executableName: 'pg_restore',
      overrideEnvVar: 'PG_RESTORE_PATH',
    },
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        event: 'db.restore.completed',
        backupPath,
        target: parseDatabaseUrl(targetDatabaseUrl).safeDisplay,
        checksum,
      },
      null,
      2,
    )}\n`,
  );
}

void main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify(
      {
        event: 'db.restore.failed',
        message: error instanceof Error ? error.message : 'Unknown restore error',
      },
      null,
      2,
    )}\n`,
  );
  process.exit(1);
});
