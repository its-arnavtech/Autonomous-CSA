import { join, resolve } from 'node:path';
import {
  buildPostgresEnv,
  createBackupMetadata,
  ensureDirectory,
  getGitSha,
  getMigrationCount,
  getPgDumpCommand,
  getTimestamp,
  parseArgs,
  parseDatabaseUrl,
  pruneOldBackups,
  projectRoot,
  runCommand,
  sha256File,
  writeChecksumFile,
  writeMetadataFile,
} from './lib/postgres-tools.mjs';

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const databaseUrl =
    flags.get('database-url') ?? process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL or --database-url is required');
  }

  const outputDirectory = resolve(
    flags.get('output-dir') ??
      process.env.BACKUP_DIR ??
      join(projectRoot, 'backups'),
  );
  const pgDumpPath = flags.get('pg-dump-path') ?? getPgDumpCommand();
  const retentionDays = Number.parseInt(
    flags.get('retention-days') ??
      process.env.BACKUP_RETENTION_DAYS ??
      '14',
    10,
  );

  const database = parseDatabaseUrl(databaseUrl);
  await ensureDirectory(outputDirectory);

  const baseName = `autonomous-csa-${database.databaseName}-${getTimestamp()}`;
  const backupPath = join(outputDirectory, `${baseName}.dump`);

  await runCommand(
    pgDumpPath,
    ['--format=custom', '--compress=9', '--file', backupPath],
    {
      env: buildPostgresEnv(databaseUrl),
      executableName: 'pg_dump',
      overrideEnvVar: 'PG_DUMP_PATH',
    },
  );

  const checksum = await sha256File(backupPath);
  await writeChecksumFile(backupPath, checksum);
  await writeMetadataFile(backupPath, createBackupMetadata({
    timestamp: new Date().toISOString(),
    appVersion: process.env.APP_VERSION ?? 'dev',
    gitSha: await getGitSha(),
    databaseUrl,
    migrationCount: await getMigrationCount(),
    checksum,
  }));

  const removed = await pruneOldBackups(outputDirectory, retentionDays);

  process.stdout.write(
    `${JSON.stringify(
      {
        event: 'db.backup.completed',
        backupPath,
        checksum,
        retentionDays,
        removed,
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
        event: 'db.backup.failed',
        message: error instanceof Error ? error.message : 'Unknown backup error',
      },
      null,
      2,
    )}\n`,
  );
  process.exit(1);
});
