#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const prod = args.includes('--prod');
const olderThanArg = args.find((arg) => arg.startsWith('--older-than-days='));
const limitArg = args.find((arg) => arg.startsWith('--limit='));

const olderThanDays = Number(olderThanArg?.split('=')[1] ?? 180);
const limit = Number(limitArg?.split('=')[1] ?? 1000);

if (!Number.isFinite(olderThanDays) || olderThanDays < 1) {
  throw new Error('--older-than-days must be a positive number');
}
if (!Number.isFinite(limit) || limit < 1) {
  throw new Error('--limit must be a positive number');
}

const convexArgs = [
  'convex',
  'run',
  ...(prod ? ['--prod'] : []),
  'data:auditRetentionDryRun',
  JSON.stringify({ olderThanDays, limit }),
];

const result = spawnSync('npx', convexArgs, { stdio: 'inherit' });
process.exit(result.status ?? 1);
