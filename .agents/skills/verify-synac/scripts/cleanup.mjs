#!/usr/bin/env node
import {
  beginCleanup,
  evidenceDir,
  noteWritesSinceObserved,
  ownedSessions,
  readRun,
  restoreOwnedWrites,
  sessionAlive,
  sessionConvex,
  sessionWeb,
  stateDir,
  stopRecordedPid,
  tmux,
  writeRun,
} from './runtime.mjs';

const help = `Usage: node .agents/skills/verify-synac/scripts/cleanup.mjs

Stops tmux sessions this skill started for this checkout (${sessionConvex} and
${sessionWeb}) and the listener pids recorded in ${stateDir}/run.json, after
checking each pid's start time. Sends SIGTERM, then SIGKILL only while that
start time still matches. Another checkout's sessions and pids are left
alone. A foreign or legacy snapshot is backed up and not restored. Processes
recorded for this checkout are still stopped.
Restores a watched file to the launch snapshot when its current bytes still
match a recorded tool write. Backs that file up under
${stateDir}/restored/<run-id>/ first, including when the path is a
symlink. Never changes the git index. Any other change is left in place
and printed as a warning.

Leaves ${stateDir}/evidence/ in place.
`;

function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stdout.write(help);
    return;
  }
  const gate = beginCleanup();
  if (!gate.stopOwn) {
    console.log(`evidence ${evidenceDir}`);
    return;
  }
  const run = readRun();
  const sessions = run.sessions.filter((name) => ownedSessions.has(name));
  for (const name of sessions) {
    if (!sessionAlive(name)) continue;
    const result = tmux(['kill-session', '-t', name], { stdio: 'inherit' });
    if (result.status !== 0) {
      console.error(
        `cleanup: tmux kill-session ${name} exited ${result.status}`,
      );
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
    const outcome = stopRecordedPid(saved);
    if (outcome === 'exited') {
      console.log(`pid ${saved.pid} (${name}) already exited`);
      continue;
    }
    if (outcome === 'reused' || outcome === 'reused-before-kill') {
      console.log(
        `skipped pid ${saved.pid} (${name}): it is no longer the process launch started`,
      );
      continue;
    }
    if (outcome === 'kill') {
      console.log(`sent SIGKILL to pid ${saved.pid} (${name}) after SIGTERM`);
    }
    if (outcome === 'term' || outcome === 'kill') signaled.push(saved.pid);
  }
  if (signaled.length > 0) console.log(`signaled pids ${signaled.join(', ')}`);

  if (gate.restore) {
    noteWritesSinceObserved();
    restoreOwnedWrites();
  }
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
