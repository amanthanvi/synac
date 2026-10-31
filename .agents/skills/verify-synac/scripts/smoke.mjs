#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  baseUrl,
  evidenceDir,
  ensureState,
  listenerPids,
  portOwner,
  readRun,
  listenWebPort,
  root,
  sameProcess,
} from './runtime.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(scriptDir, '..');

const help = `Usage: node .agents/skills/verify-synac/scripts/smoke.mjs [--drive]

Runs doctor, then the CLI checks, then Playwright.
--drive walks the feature map. The default is the short smoke path.
`;

export function warnForeignWebPort() {
  const port = listenWebPort();
  const saved = readRun().pids.web;
  const live = listenerPids(port);
  const matches = saved
    ? live.some((pid) => sameProcess(saved, pid))
    : live.length === 0;
  if (matches) return;
  console.warn(
    `warning: port ${port} owner (${portOwner(port)}) is not the web pid recorded for this checkout.`,
  );
}

function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stdout.write(help);
    return;
  }
  ensureState();
  warnForeignWebPort();
  const drive = process.argv.includes('--drive');
  const doctor = spawnSync(
    process.execPath,
    [path.join(scriptDir, 'doctor.mjs')],
    {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
    },
  );
  if (doctor.status !== 0) {
    console.error('doctor is not READY. Browser and CLI drives were skipped.');
    process.exit(doctor.status ?? 2);
  }

  const cliArgs = [path.join(scriptDir, 'cli.mjs')];
  if (!drive) cliArgs.push('--smoke');
  const cli = spawnSync(process.execPath, cliArgs, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (cli.status !== 0) process.exit(cli.status ?? 1);

  const spec = path.join(scriptDir, drive ? 'drive.spec.ts' : 'smoke.spec.ts');
  const config = path.join(skillDir, 'playwright.config.mjs');
  const playwright = path.join(
    root,
    'apps/e2e/node_modules/@playwright/test/cli.js',
  );
  const result = spawnSync(
    process.execPath,
    [playwright, 'test', '--config', config, spec],
    {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        E2E_BASE_URL: baseUrl,
        VERIFY_EVIDENCE_DIR: evidenceDir,
        NODE_PATH: path.join(root, 'apps/e2e/node_modules'),
      },
    },
  );
  process.exit(result.status ?? 1);
}

function sameFile(left, right) {
  try {
    return realpathSync(left) === realpathSync(right);
  } catch {
    return false;
  }
}

const invoked =
  process.argv[1] !== undefined &&
  sameFile(process.argv[1], fileURLToPath(import.meta.url));
if (invoked) main();
