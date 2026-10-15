import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const realRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const repo = `/tmp/synac-verify-repo-${process.pid}`;
const state = `/tmp/synac-verify-test-${process.pid}`;

rmSync(repo, { recursive: true, force: true });
rmSync(state, { recursive: true, force: true });
mkdirSync(repo, { recursive: true });

process.env.SYNAC_VERIFY_ROOT = repo;
process.env.SYNAC_VERIFY_STATE_DIR = state;
process.env.VERIFY_EVIDENCE_DIR = path.join(state, 'evidence');

// runtime.mjs binds the checkout and chdir at import, so this import stays
// after SYNAC_VERIFY_ROOT points at the temp repo.
const { root, processIdentity, sessionConvex, sessionsFor, stateDirFor, tmux } = await import(
  './runtime.mjs'
);

after(() => {
  rmSync(repo, { recursive: true, force: true });
  rmSync(state, { recursive: true, force: true });
});

function writeCheckoutRun(dir, repoRoot, sessions, identity) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  writeFileSync(
    path.join(dir, 'run.json'),
    `${JSON.stringify(
      {
        sessions,
        pids: { convex: identity, web: null, convexSite: null },
        startedAt: '',
        webMode: 'start',
        baseUrl: 'http://127.0.0.1:3000',
        repoRoot,
      },
      null,
      2,
    )}\n`,
  );
}

function waitForSpawn(child, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} did not spawn`)), 2000);
    child.once('spawn', () => {
      clearTimeout(timer);
      resolve();
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

test('cleanup from a second checkout does not stop the first', async () => {
  const rootB = `/tmp/synac-verify-repo-b-${process.pid}`;
  mkdirSync(rootB, { recursive: true });
  const dirA = stateDirFor(root);
  const dirB = stateDirFor(rootB);
  const sessionsA = sessionsFor(root);
  const sessionsB = sessionsFor(rootB);
  assert.notEqual(dirA, dirB);
  assert.match(dirA, /^\/tmp\/synac-verify-[0-9a-f]{12}$/);
  assert.notEqual(sessionsA.convex, sessionsB.convex);
  assert.equal(sessionConvex, sessionsA.convex);
  assert.notEqual(sessionConvex, 'synac-verify-convex');
  const started = [];
  const sleepA = spawn('sleep', ['60'], { stdio: 'ignore' });
  let sleepB;
  try {
    await waitForSpawn(sleepA, 'sleep A');
    sleepB = spawn('sleep', ['60'], { stdio: 'ignore' });
    await waitForSpawn(sleepB, 'sleep B');
    const idA = processIdentity(sleepA.pid);
    const idB = processIdentity(sleepB.pid);
    assert.ok(idA);
    assert.ok(idB);
    writeCheckoutRun(dirA, root, [sessionsA.convex], idA);
    writeCheckoutRun(dirB, rootB, [sessionsB.convex, sessionsA.convex], idB);
    for (const name of [sessionsA.convex, sessionsB.convex]) {
      tmux(['kill-session', '-t', name], { timeout: 5000 });
      const created = tmux(['new-session', '-d', '-s', name, 'sleep', '60'], { timeout: 5000 });
      assert.equal(created.status, 0, created.stderr);
      started.push(name);
    }
    const env = { ...process.env };
    delete env.SYNAC_VERIFY_STATE_DIR;
    delete env.VERIFY_EVIDENCE_DIR;
    env.SYNAC_VERIFY_ROOT = rootB;
    const cleanup = path.join(realRoot, '.agents/skills/verify-synac/scripts/cleanup.mjs');
    const result = spawnSync(process.execPath, [cleanup], { env, encoding: 'utf8', timeout: 20_000 });
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.match(output, new RegExp(`stopped session ${sessionsB.convex}`));
    assert.doesNotMatch(output, new RegExp(`stopped session ${sessionsA.convex}`));
    assert.doesNotMatch(output, new RegExp(`\\b${sleepA.pid}\\b`));
    assert.equal(tmux(['has-session', '-t', sessionsA.convex]).status, 0);
    assert.notEqual(tmux(['has-session', '-t', sessionsB.convex]).status, 0);
    assert.equal(processIdentity(sleepA.pid)?.pid, sleepA.pid);
    assert.match(output, new RegExp(`\\b${sleepB.pid}\\b`));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('sleep B was not stopped')), 3000);
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      if (sleepB.exitCode !== null || sleepB.signalCode !== null) done();
      else sleepB.once('exit', done);
    });
    assert.equal(processIdentity(sleepB.pid), null);
  } finally {
    for (const name of started) tmux(['kill-session', '-t', name], { timeout: 5000 });
    try {
      sleepA.kill('SIGKILL');
    } catch {
      // already exited
    }
    try {
      sleepB?.kill('SIGKILL');
    } catch {
      // already exited
    }
    rmSync(rootB, { recursive: true, force: true });
    rmSync(dirA, { recursive: true, force: true });
    rmSync(dirB, { recursive: true, force: true });
  }
});
