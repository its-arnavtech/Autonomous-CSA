import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function parseArgs(argv) {
  const positional = [];
  const flags = new Map();

  for (const entry of argv) {
    if (entry.startsWith('--')) {
      const [rawKey, rawValue] = entry.slice(2).split('=');
      flags.set(rawKey, rawValue ?? 'true');
      continue;
    }

    positional.push(entry);
  }

  return { positional, flags };
}

export function getNodeCommand() {
  return process.execPath;
}

export function getPnpmCommand() {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

export function getWorkspacePrismaCommand() {
  return resolve(
    projectRoot,
    'packages',
    'db',
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
  );
}

export function getPsqlCommand() {
  return process.env.PSQL_PATH ??
    (process.platform === 'win32' ? 'psql.exe' : 'psql');
}

export function getPgDumpCommand() {
  return process.env.PG_DUMP_PATH ??
    (process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump');
}

export function getPgRestoreCommand() {
  return process.env.PG_RESTORE_PATH ??
    (process.platform === 'win32' ? 'pg_restore.exe' : 'pg_restore');
}

export function getTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function createTempDatabaseName(seed = Date.now()) {
  const prefix = 'autonomous_restore_verify_';
  const suffix = String(seed).replace(/[^0-9a-z]/gi, '').slice(0, 63 - prefix.length);
  return `${prefix}${suffix || 'temp'}`;
}

export function parseDatabaseUrl(databaseUrl) {
  const parsed = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('DATABASE_URL must use the postgres:// or postgresql:// protocol');
  }

  const databaseName = parsed.pathname.replace(/^\/+/, '');
  if (!databaseName) {
    throw new Error('DATABASE_URL must include a database name');
  }

  return {
    url: parsed,
    databaseName,
    safeDisplay: `${parsed.protocol}//${parsed.username ? `${parsed.username}@` : ''}${parsed.hostname}:${parsed.port || '5432'}/${databaseName}`,
  };
}

export function withDatabaseName(databaseUrl, databaseName) {
  const parsed = new URL(databaseUrl);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}

export function isProductionLikeDatabase(databaseUrl) {
  const { url } = parseDatabaseUrl(databaseUrl);
  const host = url.hostname.toLowerCase();
  if (['localhost', '127.0.0.1', '::1'].includes(host)) {
    return false;
  }

  return (
    host.includes('prod') ||
    host.includes('production') ||
    host.includes('primary')
  );
}

export function buildPostgresEnv(databaseUrl, overrides = {}) {
  const { url, databaseName } = parseDatabaseUrl(databaseUrl);
  const env = {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: databaseName,
    ...overrides,
  };

  const sslmode = url.searchParams.get('sslmode');
  if (sslmode) {
    env.PGSSLMODE = sslmode;
  }

  return env;
}

export function createBackupMetadata(input) {
  const metadata = {
    timestamp: input.timestamp,
    appVersion: input.appVersion,
    gitSha: input.gitSha,
    database: parseDatabaseUrl(input.databaseUrl).safeDisplay,
    migrationCount: input.migrationCount,
    checksum: input.checksum,
  };

  if (input.postgresVersions) {
    metadata.postgresVersions = input.postgresVersions;
  }

  return metadata;
}

export function parsePostgresMajorVersion(output, label = 'PostgreSQL version') {
  const text = String(output ?? '').trim();
  const match = text.match(/(?:PostgreSQL\)?\s+|^)(\d+)(?:\.\d+)?/i);
  const major = match ? Number.parseInt(match[1], 10) : Number.NaN;

  if (!Number.isInteger(major) || major <= 0) {
    throw new Error(`Could not parse ${label} major version from "${text || '<empty>'}"`);
  }

  return major;
}

export function evaluatePostgresToolCompatibility({ serverMajor, toolMajor, toolName }) {
  if (!Number.isInteger(serverMajor) || serverMajor <= 0) {
    throw new Error(`Invalid PostgreSQL server major version: ${serverMajor}`);
  }
  if (!Number.isInteger(toolMajor) || toolMajor <= 0) {
    throw new Error(`Invalid ${toolName} major version: ${toolMajor}`);
  }

  if (toolMajor < serverMajor) {
    throw new Error(
      `${toolName} major version ${toolMajor} is older than PostgreSQL server major version ${serverMajor}. ` +
        `Use PostgreSQL ${serverMajor} or newer client tools, for example by setting the matching *_PATH environment variable.`,
    );
  }

  if (toolMajor > serverMajor) {
    return `${toolName} major version ${toolMajor} is newer than PostgreSQL server major version ${serverMajor}; this is allowed for logical backup/restore tooling, but matching major-version client tools are recommended.`;
  }

  return null;
}

export async function detectPostgresClientMajorVersion(command, options = {}) {
  const { stdout } = await runCommand(command, ['--version'], {
    capture: true,
    executableName: options.executableName ?? command,
    overrideEnvVar: options.overrideEnvVar,
  });
  const output = stdout.trim();
  return {
    output,
    major: parsePostgresMajorVersion(output, options.executableName ?? command),
  };
}

export async function detectPostgresServerMajorVersion(databaseUrl, psqlPath = getPsqlCommand()) {
  const { stdout } = await runCommand(
    psqlPath,
    ['-tAc', 'SHOW server_version;'],
    {
      env: buildPostgresEnv(databaseUrl),
      capture: true,
      executableName: 'psql',
      overrideEnvVar: 'PSQL_PATH',
    },
  );
  const output = stdout.trim();
  return {
    output,
    major: parsePostgresMajorVersion(output, 'PostgreSQL server'),
  };
}

export async function assertPostgresToolCompatibility({
  databaseUrl,
  operation,
  pgDumpPath = getPgDumpCommand(),
  pgRestorePath = getPgRestoreCommand(),
  psqlPath = getPsqlCommand(),
} = {}) {
  if (!databaseUrl) {
    throw new Error('databaseUrl is required for PostgreSQL client/server compatibility checks');
  }

  const server = await detectPostgresServerMajorVersion(databaseUrl, psqlPath);
  const tools = {
    psql: await detectPostgresClientMajorVersion(psqlPath, {
      executableName: 'psql',
      overrideEnvVar: 'PSQL_PATH',
    }),
  };

  if (operation === 'backup') {
    tools.pgDump = await detectPostgresClientMajorVersion(pgDumpPath, {
      executableName: 'pg_dump',
      overrideEnvVar: 'PG_DUMP_PATH',
    });
  } else if (operation === 'restore' || operation === 'verify') {
    tools.pgRestore = await detectPostgresClientMajorVersion(pgRestorePath, {
      executableName: 'pg_restore',
      overrideEnvVar: 'PG_RESTORE_PATH',
    });
  } else {
    throw new Error(`Unknown PostgreSQL compatibility operation: ${operation}`);
  }

  const warnings = [];
  for (const [toolName, tool] of Object.entries(tools)) {
    const warning = evaluatePostgresToolCompatibility({
      serverMajor: server.major,
      toolMajor: tool.major,
      toolName,
    });
    if (warning) {
      warnings.push(warning);
    }
  }

  return {
    operation,
    server,
    tools,
    warnings,
  };
}

function formatMissingExecutableError(command, options, error) {
  const executableName = options.executableName ?? command;
  const overrideEnvVar = options.overrideEnvVar;
  const locationHint = overrideEnvVar
    ? `Set ${overrideEnvVar}=<absolute path to ${executableName}> or add ${executableName} to PATH.`
    : `Add ${executableName} to PATH.`;

  return new Error(
    `Required executable "${executableName}" was not found. ${locationHint}`,
    { cause: error },
  );
}

function quoteWindowsShellArgument(value) {
  if (value === '') {
    return '""';
  }

  if (!/[\s"]/u.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}

export async function runCommand(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const requiresCmdProxy = process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
    const useShell = options.shell ?? (
      process.platform === 'win32' &&
      requiresCmdProxy
    );
    const spawnCommand = requiresCmdProxy
      ? (process.env.ComSpec ?? 'cmd.exe')
      : command;
    const spawnArgs = requiresCmdProxy && useShell
      ? [
          '/d',
          '/s',
          '/c',
          [quoteWindowsShellArgument(command), ...args.map(quoteWindowsShellArgument)].join(' '),
        ]
      : args;
    const child = spawn(spawnCommand, spawnArgs, {
      cwd: options.cwd ?? projectRoot,
      env: options.env ?? process.env,
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      shell: requiresCmdProxy ? false : useShell,
    });

    let stdout = '';
    let stderr = '';

    if (options.capture) {
      child.stdout?.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.on('error', (error) => {
      if (error && typeof error === 'object' && error.code === 'ENOENT') {
        rejectPromise(formatMissingExecutableError(command, options, error));
        return;
      }

      rejectPromise(error);
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }

      rejectPromise(
        new Error(
          `${command} ${args.join(' ')} failed with exit code ${code}\n${stderr || stdout}`.trim(),
        ),
      );
    });
  });
}

export async function ensureDirectory(path) {
  await mkdir(path, { recursive: true });
}

export async function sha256File(filePath) {
  const file = await readFile(filePath);
  return createHash('sha256').update(file).digest('hex');
}

export async function writeChecksumFile(targetPath, checksum) {
  await writeFile(`${targetPath}.sha256`, `${checksum}  ${targetPath.split(/[\\/]/).pop()}\n`);
}

export async function verifyChecksumFile(targetPath) {
  const checksumPath = `${targetPath}.sha256`;
  const [expectedLine, actual] = await Promise.all([
    readFile(checksumPath, 'utf8'),
    sha256File(targetPath),
  ]);
  const expected = expectedLine.trim().split(/\s+/)[0];

  if (expected !== actual) {
    throw new Error(`Checksum mismatch for ${targetPath}`);
  }

  return actual;
}

export async function writeMetadataFile(targetPath, metadata) {
  await writeFile(`${targetPath}.json`, `${JSON.stringify(metadata, null, 2)}\n`);
}

export async function getGitSha() {
  try {
    const { stdout } = await runCommand('git', ['rev-parse', '--short', 'HEAD'], {
      capture: true,
    });
    return stdout.trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function getMigrationCount() {
  const migrationsDir = join(projectRoot, 'packages', 'db', 'prisma', 'migrations');
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).length;
}

export async function pruneOldBackups(directory, retentionDays) {
  if (retentionDays <= 0) {
    return [];
  }

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const entries = await readdir(directory, { withFileTypes: true });
  const removed = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const fullPath = join(directory, entry.name);
    const details = await stat(fullPath);
    if (details.mtimeMs >= cutoff) {
      continue;
    }

    await rm(fullPath, { force: true });
    removed.push(entry.name);
  }

  return removed;
}

export async function countTableRows(databaseUrl, tableName) {
  const env = buildPostgresEnv(databaseUrl);
  const { stdout } = await runCommand(
    getPsqlCommand(),
    ['-tAc', `SELECT COUNT(*) FROM "${tableName}"`],
    {
      env,
      capture: true,
      executableName: 'psql',
      overrideEnvVar: 'PSQL_PATH',
    },
  );

  return Number.parseInt(stdout.trim(), 10);
}

export async function assertTableExists(databaseUrl, tableName) {
  const env = buildPostgresEnv(databaseUrl);
  const { stdout } = await runCommand(
    getPsqlCommand(),
    ['-tAc', `SELECT to_regclass('public."${tableName}"')`],
    {
      env,
      capture: true,
      executableName: 'psql',
      overrideEnvVar: 'PSQL_PATH',
    },
  );

  if (!stdout.includes(tableName)) {
    throw new Error(`Expected table ${tableName} was not found after restore`);
  }
}
