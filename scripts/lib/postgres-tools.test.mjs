import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { copyFile, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createBackupMetadata,
  createTempDatabaseName,
  getPgDumpCommand,
  getPgRestoreCommand,
  getPsqlCommand,
  getTimestamp,
  isProductionLikeDatabase,
  parseDatabaseUrl,
  runCommand,
  verifyChecksumFile,
  writeChecksumFile,
} from './postgres-tools.mjs';

test('parseDatabaseUrl redacts password from safe display', () => {
  const parsed = parseDatabaseUrl(
    'postgresql://user:super-secret@example.com:5432/app_db?sslmode=require',
  );

  assert.equal(parsed.databaseName, 'app_db');
  assert.equal(parsed.safeDisplay, 'postgresql://user@example.com:5432/app_db');
  assert.equal(parsed.url.password, 'super-secret');
});

test('production-like detection ignores localhost and flags production hosts', () => {
  assert.equal(
    isProductionLikeDatabase('postgresql://postgres:postgres@localhost:5432/app'),
    false,
  );
  assert.equal(
    isProductionLikeDatabase('postgresql://postgres:postgres@db-production.internal:5432/app'),
    true,
  );
});

test('timestamp output is filename-safe', () => {
  assert.match(getTimestamp(), /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/);
});

test('checksum validation succeeds for matching files and fails on mismatch', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'autonomous csa postgres tools '));
  const backupPath = join(directory, 'sample.dump');
  await writeFile(backupPath, 'backup-payload');

  const checksum = createHash('sha256')
    .update('backup-payload')
    .digest('hex');
  await writeChecksumFile(backupPath, checksum);

  await assert.doesNotReject(() => verifyChecksumFile(backupPath));

  await writeFile(backupPath, 'tampered-payload');
  await assert.rejects(
    () => verifyChecksumFile(backupPath),
    /Checksum mismatch/,
  );
});

test('backup metadata uses a redacted database display value', () => {
  const metadata = createBackupMetadata({
    timestamp: '2026-06-15T00:00:00.000Z',
    appVersion: 'phase10',
    gitSha: 'abc123',
    databaseUrl: 'postgresql://user:super-secret@example.com:5432/app_db',
    migrationCount: 10,
    checksum: 'checksum',
  });

  assert.deepEqual(metadata, {
    timestamp: '2026-06-15T00:00:00.000Z',
    appVersion: 'phase10',
    gitSha: 'abc123',
    database: 'postgresql://user@example.com:5432/app_db',
    migrationCount: 10,
    checksum: 'checksum',
  });
});

test('temporary database names stay bounded and deterministic', () => {
  const name = createTempDatabaseName(12345678901234567890n);
  assert.match(name, /^autonomous_restore_verify_[0-9a-z]+$/);
  assert.ok(name.length <= 63);
});

test('postgres client command helpers honor environment overrides', async () => {
  const previous = {
    PG_DUMP_PATH: process.env.PG_DUMP_PATH,
    PG_RESTORE_PATH: process.env.PG_RESTORE_PATH,
    PSQL_PATH: process.env.PSQL_PATH,
  };

  process.env.PG_DUMP_PATH = '/custom/pg_dump';
  process.env.PG_RESTORE_PATH = '/custom/pg_restore';
  process.env.PSQL_PATH = '/custom/psql';

  assert.equal(getPgDumpCommand(), '/custom/pg_dump');
  assert.equal(getPgRestoreCommand(), '/custom/pg_restore');
  assert.equal(getPsqlCommand(), '/custom/psql');

  for (const [key, value] of Object.entries(previous)) {
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

test('runCommand surfaces actionable missing executable hints', async () => {
  await assert.rejects(
    () =>
      runCommand('definitely-missing-pg-dump.exe', ['--version'], {
        executableName: 'pg_dump',
        overrideEnvVar: 'PG_DUMP_PATH',
      }),
    /PG_DUMP_PATH/,
  );
});

test('runCommand supports executable paths with spaces', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'autonomous csa node exe '));
  const copiedNodePath = join(directory, 'node copy.exe');
  await copyFile(process.execPath, copiedNodePath);

  const result = await runCommand(
    copiedNodePath,
    ['-e', 'process.stdout.write("ok")'],
    { capture: true },
  );

  assert.equal(result.stdout, 'ok');
});

function runNodeScript(scriptRelativePath, args = [], env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [join(process.cwd(), scriptRelativePath), ...args],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ...env,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

test('restore script rejects missing target database url', async () => {
  const result = await runNodeScript('scripts/db-restore.mjs', ['backup.dump']);
  assert.equal(result.code, 1);
  assert.match(
    result.stderr,
    /TARGET_DATABASE_URL or --target-database-url is required/,
  );
});

test('restore script refuses production-like targets without explicit override', async () => {
  const result = await runNodeScript(
    'scripts/db-restore.mjs',
    [
      'backup.dump',
      '--target-database-url=postgresql://postgres:postgres@prod-db.internal:5432/app',
      '--yes=true',
    ],
  );
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Refusing production-like restore/);
});
