#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const stagingScript = join(root, 'scripts', 'staging-local.mjs');
const channelScript = join(root, 'scripts', 'channel-staging-verify.mjs');
const stagingResultPath = join(root, 'run-output', 'staging-local-results.json');
const channelResultPath = join(root, 'run-output', 'channel-staging-results.json');

function runNode(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error || result.status !== 0) {
    const detail = result.error ? `: ${result.error.message}` : '';
    throw new Error(`${script} failed with exit code ${result.status}${detail}`);
  }
}

function readJson(path) {
  if (!existsSync(path)) {
    throw new Error(`Expected verification result was not written: ${path}`);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

function printSummary() {
  const staging = readJson(stagingResultPath);
  const channel = readJson(channelResultPath);
  const summary = {
    event: 'demo.ready',
    version: staging.version?.api?.version ?? '1.0.0-local',
    postgresVersion: staging.postgresVersion,
    migrationCount: staging.migrationCount,
    checks: {
      readiness: staging.checks?.readiness,
      redisBullmq: staging.checks?.redisBullmq,
      backupRestore: staging.restore ? 'passed' : 'failed',
      signedChannelWorkflow: channel.event === 'channel.staging.verify.completed' ? 'passed' : 'failed',
    },
    urls: {
      web: 'http://localhost:3100/login',
      apiReadiness: 'http://localhost:3101/health/ready',
      workerReadiness: 'http://localhost:3102/health/ready',
    },
    instructions: [
      'Open the web URL to inspect the seeded portfolio environment.',
      'Generated credentials remain in the ignored run-output/staging-local.env file and are not printed.',
      'Run pnpm demo:down to stop services or pnpm demo:reset to remove demo volumes and rotate local secrets.',
    ],
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

function verifyDemo() {
  runNode(stagingScript, ['verify']);
  runNode(channelScript);
  printSummary();
}

const command = process.argv[2];
try {
  if (command === 'up' || command === 'verify') verifyDemo();
  else if (command === 'down' || command === 'reset') runNode(stagingScript, [command]);
  else throw new Error('Usage: node scripts/demo.mjs <up|verify|down|reset>');
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    event: 'demo.failed',
    message: error instanceof Error ? error.message : 'unknown error',
  }, null, 2)}\n`);
  process.exit(1);
}
