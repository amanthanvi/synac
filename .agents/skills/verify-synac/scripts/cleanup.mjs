#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';

import {
  evidenceDir,
  ownedSessions,
  processIdentity,
  readRun,
  restoreOwnedWrites,
  sameProcess,
  sessionAlive,
  tmux,
  writeRun,
} from './runtime.mjs';

const help = `Usage: node .agents/skills/verify-synac/scripts/cleanup.mjs

Stops tmux sessions this skill started (synac-verify-convex and synac-verify-web)
and the listener pids recorded in /tmp/synac-verify/run.json, after checking
each pid's start time. Restores a watched file to the launch snapshot when
its current bytes still match what the run wrote. Backs that file up under
/tmp/synac-verify/restored/<run-id>/ first, including when the path is a
symlink. Never changes the git index. Any other change is left in place
and printed as a warning.

Leaves /tmp/synac-verify/evidence/ in place.
`;

function childPids(pid) {
  const file = `/proc/${pid}/task/${pid}/children`;
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .trim()
    .split(/\s+/)
    .map((part) => Number(part))
    .filter((child) => Number.isInteger(child) && child > 1);
}

function killTree(pid) {
  if (!Number.isInteger(pid) || pid <= 1) return;
  for (const child of childPids(pid)) killTree(child);
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return;
  }
}

function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stdout.write(help);
    return;
  }
  const run = readRun();
  const sessions = run.sessions.filter((name) => ownedSessions.has(name));
  for (const name of sessions) {
    if (!sessionAlive(name)) continue;
    const result = tmux(['kill-session', '-t', name], { stdio: 'inherit' });
    if (result.status !== 0) {
      console.error(`cleanup: tmux kill-session ${name} exited ${result.status}`);
    } else {
      console.log(`stopped session ${name}`);
    }
  }

  const recorded = [
    ['convex', run.pids.convex],
    ['web', run.pids.web],
    ['convexSite', run.pids.convexSite],
  ];
  const signaled = [];
  const seen = new Set();
  for (const [name, saved] of recorded) {
    if (!saved) continue;
    if (seen.has(saved.pid)) continue;
    seen.add(saved.pid);
    const live = processIdentity(saved.pid);
    if (!live) {
      console.log(`pid ${saved.pid} (${name}) already exited`);
      continue;
    }
    if (!sameProcess(saved, saved.pid)) {
      console.log(`skipped pid ${saved.pid} (${name}): it is no longer the process launch started`);
      continue;
    }
    killTree(saved.pid);
    signaled.push(saved.pid);
  }
  if (signaled.length > 0) console.log(`signaled pids ${signaled.join(', ')}`);

  restoreOwnedWrites();
  const cleared = readRun();
  writeRun({
    ...cleared,
    sessions: [],
    pids: { convex: null, web: null, convexSite: null },
    dirtyBefore: undefined,
  });
  console.log(`evidence ${evidenceDir}`);
}

main();
