import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const destructivePatterns = [
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+COLUMN\b/i,
  /\bDROP\s+INDEX\b/i,
  /\bALTER\s+TABLE\b[\s\S]*\bDROP\s+CONSTRAINT\b/i,
  /\bTRUNCATE\b/i,
];

function runPrismaCommand(args: string[]) {
  const prismaCommand =
    process.platform === 'win32'
      ? '.\\node_modules\\.bin\\prisma.cmd'
      : './node_modules/.bin/prisma';

  const result = spawnSync(prismaCommand, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function inspectMigrations() {
  const migrationsDir = join(process.cwd(), 'prisma', 'migrations');
  const entries = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const findings: string[] = [];

  for (const entry of entries) {
    const sqlPath = join(migrationsDir, entry, 'migration.sql');
    const sql = readFileSync(sqlPath, 'utf8');

    for (const pattern of destructivePatterns) {
      if (pattern.test(sql)) {
        findings.push(`${entry}: matched ${pattern}`);
      }
    }
  }

  if (findings.length === 0) {
    console.log('No destructive SQL heuristics matched in migrations.');
    return;
  }

  console.log('Potentially destructive migration statements detected:');
  for (const finding of findings) {
    console.log(`- ${finding}`);
  }
}

runPrismaCommand(['validate', '--schema', 'prisma/schema.prisma']);
runPrismaCommand(['migrate', 'status', '--schema', 'prisma/schema.prisma']);
inspectMigrations();
