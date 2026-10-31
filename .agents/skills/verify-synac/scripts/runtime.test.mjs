import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const realRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const repo = `/tmp/synac-verify-repo-${process.pid}`;
const state = `/tmp/synac-verify-test-${process.pid}`;
const scratchDir = path.join(repo, '.agents/skills/convex-backup-test');

function git(args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

rmSync(repo, { recursive: true, force: true });
rmSync(state, { recursive: true, force: true });
mkdirSync(path.join(repo, 'apps/web'), { recursive: true });
mkdirSync(path.join(repo, '.agents/skills'), { recursive: true });
mkdirSync(path.join(repo, 'convex/_generated/ai'), { recursive: true });
writeFileSync(path.join(repo, 'AGENTS.md'), 'agents\n');
writeFileSync(path.join(repo, 'CLAUDE.md'), 'claude\n');
writeFileSync(path.join(repo, 'apps/web/AGENTS.md'), 'web agents\n');
writeFileSync(path.join(repo, 'apps/web/CLAUDE.md'), '@AGENTS.md\n');
writeFileSync(path.join(repo, 'skills-lock.json'), '{}\n');
writeFileSync(path.join(repo, 'convex/_generated/ai/guidelines.md'), 'guide\n');
git(['init']);
git(['config', 'user.email', 'verify@example.com']);
git(['config', 'user.name', 'verify']);
git(['add', '.']);
git(['-c', 'commit.gpgsign=false', 'commit', '-m', 'init']);

process.env.SYNAC_VERIFY_ROOT = repo;
process.env.SYNAC_VERIFY_STATE_DIR = state;
process.env.VERIFY_EVIDENCE_DIR = path.join(state, 'evidence');

// runtime.mjs binds the checkout and chdir at import, so this import stays
// after SYNAC_VERIFY_ROOT points at the temp repo.
const {
  root,
  ensureState,
  snapshotWatchedFiles,
  captureToolWrites,
  markStepBaseline,
  markObserved,
  noteWritesSinceObserved,
  restoreOwnedWrites,
  assertSnapshotCheckout,
  beginCleanup,
  beginLaunch,
  runBelongsToCheckout,
  writeRun,
  readRun,
  runFile,
  stopRecordedPid,
  processIdentity,
  sameProcess,
} = await import('./runtime.mjs');

after(() => {
  rmSync(repo, { recursive: true, force: true });
  rmSync(state, { recursive: true, force: true });
});

const linkRel = '.agents/skills/convex-backup-test/link.md';
const linkAbs = path.join(root, linkRel);

function backupId() {
  return readFileSync(path.join(state, 'snapshot/backup-id'), 'utf8').trim();
}

function exists(file) {
  try {
    lstatSync(file);
    return true;
  } catch {
    return false;
  }
}

test('each snapshot stores backups in its own directory, including symlinks', () => {
  try {
    snapshotWatchedFiles();
    const firstId = backupId();
    markStepBaseline();
    mkdirSync(scratchDir, { recursive: true });
    symlinkSync('target.txt', linkAbs);
    captureToolWrites('convex');
    const first = restoreOwnedWrites();
    const firstBackup = path.join(state, 'restored', firstId, linkRel);
    assert.equal(first.restored.includes(linkRel), true);
    assert.equal(lstatSync(firstBackup).isSymbolicLink(), true);
    assert.equal(readlinkSync(firstBackup), 'target.txt');
    assert.equal(exists(linkAbs), false);

    snapshotWatchedFiles();
    const secondId = backupId();
    assert.notEqual(secondId, firstId);
    markStepBaseline();
    mkdirSync(scratchDir, { recursive: true });
    symlinkSync('other.txt', linkAbs);
    captureToolWrites('convex');
    restoreOwnedWrites();
    const secondBackup = path.join(state, 'restored', secondId, linkRel);
    assert.equal(lstatSync(secondBackup).isSymbolicLink(), true);
    assert.equal(readlinkSync(secondBackup), 'other.txt');
    assert.equal(lstatSync(firstBackup).isSymbolicLink(), true);
    assert.equal(readlinkSync(firstBackup), 'target.txt');
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
});

test('launch refuses a foreign or legacy manifest and says how to clear it', () => {
  snapshotWatchedFiles();
  const manifestPath = path.join(state, 'snapshot/manifest.json');
  const original = readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(original);
  assert.equal(manifest.repoRoot, root);
  assert.equal(manifest.files['apps/web/CLAUDE.md'].kind, 'file');
  assert.equal(manifest.files['.cursor/rules/convex_rules.mdc'].kind, 'absent');
  const launch = path.join(
    realRoot,
    '.agents/skills/verify-synac/scripts/launch.mjs',
  );
  const env = {
    ...process.env,
    SYNAC_VERIFY_ROOT: repo,
    SYNAC_VERIFY_STATE_DIR: state,
    VERIFY_EVIDENCE_DIR: path.join(state, 'evidence'),
  };
  try {
    writeFileSync(
      manifestPath,
      `${JSON.stringify({ 'AGENTS.md': { kind: 'file', hash: 'abc' } })}\n`,
    );
    assert.throws(() => assertSnapshotCheckout(), /no checkout identity/);
    assert.throws(() => assertSnapshotCheckout(), /Remove .*snapshot/);
    const legacy = spawnSync(process.execPath, [launch], {
      env,
      encoding: 'utf8',
    });
    assert.notEqual(legacy.status, 0);
    assert.match(legacy.stderr, /Refusing to launch/);
    assert.match(legacy.stderr, /Remove .*snapshot/);
    const legacyGate = beginCleanup();
    assert.equal(legacyGate.restore, false);
    assert.equal(legacyGate.stopOwn, true);
    assert.equal(
      readFileSync(legacyGate.backup, 'utf8').includes('AGENTS.md'),
      true,
    );

    manifest.repoRoot = '/tmp/other-checkout';
    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
    assert.throws(() => assertSnapshotCheckout(), /Refusing to launch/);
    const foreign = spawnSync(process.execPath, [launch], {
      env,
      encoding: 'utf8',
    });
    assert.notEqual(foreign.status, 0);
    assert.match(foreign.stderr, /\/tmp\/other-checkout/);
    assert.match(foreign.stderr, /Remove .*snapshot/);
    assert.equal(
      readFileSync(manifestPath, 'utf8').includes('/tmp/other-checkout'),
      true,
    );
  } finally {
    writeFileSync(manifestPath, original);
  }
  assertSnapshotCheckout();
});

test('cleanup stops this checkout and only skips restore for a foreign manifest', async () => {
  snapshotWatchedFiles();
  const manifestPath = path.join(state, 'snapshot/manifest.json');
  const original = readFileSync(manifestPath, 'utf8');
  const lock = path.join(root, 'skills-lock.json');
  const before = readFileSync(lock, 'utf8');
  const child = spawn('sleep', ['30'], { stdio: 'ignore' });
  try {
    await new Promise((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
    const saved = processIdentity(child.pid);
    writeFileSync(lock, '{"keep":true}\n');
    const manifest = JSON.parse(original);
    manifest.repoRoot = '/tmp/other-checkout';
    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
    writeRun({
      ...readRun(),
      repoRoot: root,
      sessions: [],
      pids: { convex: saved, web: null, convexSite: null },
    });
    const cleanup = path.join(
      realRoot,
      '.agents/skills/verify-synac/scripts/cleanup.mjs',
    );
    const result = spawnSync(process.execPath, [cleanup], {
      env: {
        ...process.env,
        SYNAC_VERIFY_ROOT: repo,
        SYNAC_VERIFY_STATE_DIR: state,
        VERIFY_EVIDENCE_DIR: path.join(state, 'evidence'),
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.match(output, /Leaving files in place/);
    assert.match(output, /Backed up the manifest to /);
    assert.match(output, new RegExp(`signaled pids ${child.pid}`));
    assert.equal(readFileSync(lock, 'utf8'), '{"keep":true}\n');
    await new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) resolve();
      else child.once('exit', () => resolve());
    });
    assert.equal(processIdentity(child.pid), null);
    const backedUp = output.match(/Backed up the manifest to (\S+)\./);
    assert.ok(backedUp);
    assert.equal(
      readFileSync(backedUp[1], 'utf8').includes('/tmp/other-checkout'),
      true,
    );
    assert.equal(
      readFileSync(manifestPath, 'utf8').includes('/tmp/other-checkout'),
      true,
    );
  } finally {
    try {
      child.kill('SIGKILL');
    } catch {
      // already exited
    }
    writeFileSync(manifestPath, original);
    writeFileSync(lock, before);
  }
});

test('a hand edit survives and a tool write is restored', () => {
  const agents = path.join(root, 'AGENTS.md');
  const agentsOriginal = readFileSync(agents);
  const lock = path.join(root, 'skills-lock.json');
  const lockOriginal = readFileSync(lock);
  const claude = path.join(root, 'apps/web/CLAUDE.md');
  const claudeOriginal = readFileSync(claude);
  try {
    snapshotWatchedFiles();
    writeFileSync(
      agents,
      Buffer.concat([agentsOriginal, Buffer.from('verify-human\n')]),
    );
    writeFileSync(lock, '{"human":true}\n');
    writeFileSync(claude, '@AGENTS.md\nverify-human\n');
    markStepBaseline();
    captureToolWrites('next');
    markObserved();
    noteWritesSinceObserved();
    const left = restoreOwnedWrites();
    assert.equal(readFileSync(agents, 'utf8').includes('verify-human'), true);
    assert.equal(readFileSync(lock, 'utf8'), '{"human":true}\n');
    assert.equal(readFileSync(claude, 'utf8').includes('verify-human'), true);
    assert.equal(left.restored.includes('AGENTS.md'), false);
    assert.equal(left.restored.includes('skills-lock.json'), false);
    assert.equal(left.restored.includes('apps/web/CLAUDE.md'), false);
    assert.equal(left.warned.includes('AGENTS.md'), true);
    assert.equal(left.warned.includes('skills-lock.json'), true);

    writeFileSync(agents, agentsOriginal);
    writeFileSync(lock, lockOriginal);
    writeFileSync(claude, claudeOriginal);
    snapshotWatchedFiles();
    markStepBaseline();
    writeFileSync(lock, '{"tool":true}\n');
    captureToolWrites('convex');
    const restored = restoreOwnedWrites();
    assert.equal(readFileSync(lock, 'utf8'), lockOriginal.toString());
    assert.equal(restored.restored.includes('skills-lock.json'), true);
  } finally {
    writeFileSync(agents, agentsOriginal);
    writeFileSync(lock, lockOriginal);
    writeFileSync(claude, claudeOriginal);
  }
});

test('restore keeps the executable bit and a reused stack is not restored', () => {
  const scriptRel = '.agents/skills/convex-backup-test/run.sh';
  const scriptAbs = path.join(root, scriptRel);
  try {
    mkdirSync(scratchDir, { recursive: true });
    writeFileSync(scriptAbs, '#!/bin/sh\necho snapshot\n');
    chmodSync(scriptAbs, 0o755);
    snapshotWatchedFiles();
    markStepBaseline();
    writeFileSync(scriptAbs, '#!/bin/sh\necho edited\n');
    chmodSync(scriptAbs, 0o644);
    captureToolWrites('convex');
    assert.equal(beginLaunch('READY'), 'reuse');
    assert.equal(readFileSync(scriptAbs, 'utf8'), '#!/bin/sh\necho edited\n');
    assert.equal(beginLaunch('NOT_READY'), 'snapshot');
    assert.equal(readFileSync(scriptAbs, 'utf8'), '#!/bin/sh\necho snapshot\n');
    assert.equal(statSync(scriptAbs).mode & 0o777, 0o755);
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
});

test('a convex skill file created after launch is warned and left in place', () => {
  const rel = '.agents/skills/convex-backup-test/SKILL.md';
  const abs = path.join(root, rel);
  const warnings = [];
  const orig = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    snapshotWatchedFiles();
    markObserved();
    mkdirSync(scratchDir, { recursive: true });
    writeFileSync(abs, 'after launch\n');
    noteWritesSinceObserved();
    const writes = JSON.parse(
      readFileSync(path.join(state, 'snapshot/writes.json'), 'utf8'),
    );
    assert.equal(writes[rel], undefined);
    assert.equal(
      warnings.some((line) => line.includes(`new convex skill file ${rel}`)),
      true,
    );
    restoreOwnedWrites();
    assert.equal(readFileSync(abs, 'utf8'), 'after launch\n');
  } finally {
    console.warn = orig;
    rmSync(scratchDir, { recursive: true, force: true });
  }
});

test('a missing backup id does not reuse one directory', () => {
  const rel = '.agents/skills/convex-backup-test/extra.md';
  const abs = path.join(root, rel);
  try {
    snapshotWatchedFiles();
    markStepBaseline();
    mkdirSync(scratchDir, { recursive: true });
    writeFileSync(abs, 'one\n');
    captureToolWrites('convex');
    rmSync(path.join(state, 'snapshot/backup-id'));
    const first = restoreOwnedWrites();
    snapshotWatchedFiles();
    markStepBaseline();
    mkdirSync(scratchDir, { recursive: true });
    writeFileSync(abs, 'two\n');
    captureToolWrites('convex');
    rmSync(path.join(state, 'snapshot/backup-id'));
    const second = restoreOwnedWrites();
    assert.equal(first.backups.length, 1);
    assert.equal(second.backups.length, 1);
    const firstDir = path.dirname(first.backups[0].dest);
    const secondDir = path.dirname(second.backups[0].dest);
    assert.notEqual(firstDir, secondDir);
    assert.equal(firstDir.includes(`${path.sep}unknown`), false);
    assert.equal(secondDir.includes(`${path.sep}unknown`), false);
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
});

test('an existing evidence directory with the wrong mode is refused', () => {
  ensureState();
  const evidence = path.join(state, 'evidence');
  chmodSync(evidence, 0o755);
  assert.throws(() => ensureState(), /evidence mode is 0755/);
  assert.equal(statSync(evidence).mode & 0o777, 0o755);
  chmodSync(evidence, 0o700);
});

test('an unfinished launch restores only a recorded tool write', () => {
  const lock = path.join(root, 'skills-lock.json');
  const original = readFileSync(lock, 'utf8');
  const agents = path.join(root, 'AGENTS.md');
  const agentsOriginal = readFileSync(agents, 'utf8');
  try {
    snapshotWatchedFiles();
    markStepBaseline();
    assert.equal(
      readFileSync(path.join(state, 'snapshot/writes.json'), 'utf8').trim(),
      '{}',
    );
    assert.equal(exists(path.join(state, 'snapshot/observed.json')), false);
    writeFileSync(lock, '{"killed":true}\n');
    captureToolWrites('convex');
    writeFileSync(agents, `${agentsOriginal}human\n`);
    assert.equal(beginLaunch('NOT_READY'), 'snapshot');
    assert.equal(readFileSync(lock, 'utf8'), original);
    assert.equal(readFileSync(agents, 'utf8'), `${agentsOriginal}human\n`);
    assert.equal(
      readFileSync(path.join(state, 'snapshot/files/skills-lock.json'), 'utf8'),
      original,
    );
  } finally {
    writeFileSync(lock, original);
    writeFileSync(agents, agentsOriginal);
  }
});

test('a user edit after launch survives cleanup', () => {
  const lock = path.join(root, 'skills-lock.json');
  const original = readFileSync(lock, 'utf8');
  try {
    snapshotWatchedFiles();
    markStepBaseline();
    writeFileSync(lock, '{"tool":true}\n');
    captureToolWrites('convex');
    markObserved();
    writeFileSync(lock, '{"human":true}\n');
    noteWritesSinceObserved();
    const restored = restoreOwnedWrites();
    assert.equal(readFileSync(lock, 'utf8'), '{"human":true}\n');
    assert.equal(restored.restored.includes('skills-lock.json'), false);

    writeFileSync(lock, original);
    snapshotWatchedFiles();
    markObserved();
    writeFileSync(lock, '{"human-only":true}\n');
    noteWritesSinceObserved();
    const unrecorded = restoreOwnedWrites();
    assert.equal(readFileSync(lock, 'utf8'), '{"human-only":true}\n');
    assert.equal(unrecorded.restored.includes('skills-lock.json'), false);
  } finally {
    writeFileSync(lock, original);
  }
});

test('a user edit after an interrupted tool write survives the next launch', () => {
  const lock = path.join(root, 'skills-lock.json');
  const original = readFileSync(lock, 'utf8');
  try {
    snapshotWatchedFiles();
    markStepBaseline();
    writeFileSync(lock, '{"tool":true}\n');
    captureToolWrites('convex');
    writeFileSync(lock, '{"human":true}\n');
    assert.equal(exists(path.join(state, 'snapshot/observed.json')), false);
    assert.equal(beginLaunch('NOT_READY'), 'snapshot');
    assert.equal(readFileSync(lock, 'utf8'), '{"human":true}\n');
  } finally {
    writeFileSync(lock, original);
  }
});

test('a second beginLaunch does not restore or snapshot again', () => {
  const lock = path.join(root, 'skills-lock.json');
  const original = readFileSync(lock, 'utf8');
  try {
    snapshotWatchedFiles();
    markObserved();
    assert.equal(beginLaunch('NOT_READY'), 'snapshot');
    const id = backupId();
    writeFileSync(lock, '{"dirty":true}\n');
    assert.equal(beginLaunch('NOT_READY'), 'snapshot');
    assert.equal(readFileSync(lock, 'utf8'), '{"dirty":true}\n');
    assert.equal(backupId(), id);
    assert.equal(beginLaunch('READY'), 'reuse');
  } finally {
    writeFileSync(lock, original);
    markObserved();
  }
});

test('cleanup does not stop a run recorded for another checkout', () => {
  const warnings = [];
  const orig = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    writeRun({
      ...readRun(),
      repoRoot: '/tmp/other-checkout',
      sessions: [],
      pids: { convex: null, web: null, convexSite: null },
    });
    assert.equal(runBelongsToCheckout(), false);
  } finally {
    console.warn = orig;
  }
  assert.equal(
    warnings.some((line) => line.includes('Not stopping those processes')),
    true,
  );
  writeRun({
    ...readRun(),
    repoRoot: root,
    sessions: [],
    pids: { convex: null, web: null, convexSite: null },
  });
});

test('a run.json with no repoRoot is not this checkout', async () => {
  const child = spawn('sleep', ['30'], { stdio: 'ignore' });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('sleep did not spawn')),
        2000,
      );
      child.once('spawn', () => {
        clearTimeout(timer);
        resolve();
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    const saved = processIdentity(child.pid);
    assert.ok(saved);
    ensureState();
    writeFileSync(
      runFile,
      `${JSON.stringify({ sessions: [], pids: { convex: saved, web: null, convexSite: null } })}\n`,
    );
    const cleanup = path.join(
      realRoot,
      '.agents/skills/verify-synac/scripts/cleanup.mjs',
    );
    const result = spawnSync(process.execPath, [cleanup], {
      env: {
        ...process.env,
        SYNAC_VERIFY_ROOT: repo,
        SYNAC_VERIFY_STATE_DIR: state,
        VERIFY_EVIDENCE_DIR: path.join(state, 'evidence'),
      },
      encoding: 'utf8',
      timeout: 20_000,
    });
    assert.equal(result.status, 0, result.stderr);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.match(output, /no checkout identity/);
    assert.match(output, /Not stopping those processes/);
    assert.match(output, /Backed up the run state to /);
    assert.doesNotMatch(output, new RegExp(`\\b${child.pid}\\b`));
    assert.equal(processIdentity(child.pid)?.pid, child.pid);
    const backedUp = output.match(/Backed up the run state to (\S+)\./);
    assert.ok(backedUp);
    assert.equal(readFileSync(backedUp[1], 'utf8').includes('repoRoot'), false);
    assert.equal(readFileSync(runFile, 'utf8').includes('repoRoot'), false);
  } finally {
    try {
      child.kill('SIGKILL');
    } catch {
      // already exited
    }
    writeRun({
      ...readRun(),
      repoRoot: root,
      sessions: [],
      pids: { convex: null, web: null, convexSite: null },
    });
  }
});

test('SIGKILL waits for the launch start time to still match', async () => {
  mkdirSync(state, { recursive: true });
  const ready = path.join(state, 'sigkill-ready');
  rmSync(ready, { force: true });
  const child = spawn(
    process.execPath,
    [
      '-e',
      'const fs = require("node:fs"); process.on("SIGTERM", () => {}); fs.writeFileSync(process.env.SYNAC_SIGKILL_READY, "ok"); setInterval(() => {}, 1e9);',
    ],
    {
      env: { ...process.env, SYNAC_SIGKILL_READY: ready },
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  );
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  try {
    await new Promise((resolve, reject) => {
      let settled = false;
      let timer;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };
      timer = setTimeout(
        () =>
          finish(new Error(`signal fixture did not become ready\n${stderr}`)),
        5000,
      );
      const wait = () => {
        if (settled) return;
        if (exists(ready)) {
          finish();
          return;
        }
        setTimeout(wait, 20);
      };
      child.once('error', (error) => finish(error));
      child.once('exit', (code, signal) => {
        finish(
          new Error(
            `signal fixture exited early code=${code} signal=${signal}\n${stderr}`,
          ),
        );
      });
      wait();
    });
    const saved = processIdentity(child.pid);
    assert.ok(saved);
    assert.notEqual(saved.startTime, '');
    const wrong = { ...saved, startTime: '1' };
    assert.equal(stopRecordedPid(wrong, 200), 'reused');
    assert.equal(processIdentity(child.pid)?.pid, child.pid);
    assert.equal(stopRecordedPid(saved, 400), 'kill');
    const ended = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('signal fixture survived SIGKILL')),
        2000,
      );
      const done = (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal });
      };
      if (child.exitCode !== null || child.signalCode !== null) {
        done(child.exitCode, child.signalCode);
        return;
      }
      child.once('exit', done);
    });
    assert.equal(ended.signal, 'SIGKILL');
  } finally {
    try {
      child.kill('SIGKILL');
    } catch {
      // already exited
    }
  }
});

test('a recorded pid stores argv0 and a hash, not the command line', async () => {
  const secret = 'super-secret-instance-value';
  const child = spawn(
    process.execPath,
    ['-e', 'setInterval(() => {}, 1e9)', '--instance-secret', secret],
    {
      stdio: 'ignore',
    },
  );
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('secret fixture did not spawn')),
        2000,
      );
      child.once('spawn', () => {
        clearTimeout(timer);
        resolve();
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    const saved = processIdentity(child.pid);
    assert.ok(saved);
    assert.equal(saved.argv0, process.execPath);
    assert.equal(Object.hasOwn(saved, 'cmdline'), false);
    assert.equal(JSON.stringify(saved).includes(secret), false);
    assert.match(saved.cmdlineHash, /^[0-9a-f]{64}$/);
    writeRun({
      ...readRun(),
      repoRoot: root,
      sessions: [],
      pids: { convex: saved, web: null, convexSite: null },
    });
    const disk = readFileSync(runFile, 'utf8');
    assert.equal(disk.includes(secret), false);
    assert.equal(disk.includes('"cmdline"'), false);
    assert.equal(sameProcess(readRun().pids.convex, child.pid), true);
  } finally {
    try {
      child.kill('SIGKILL');
    } catch {
      // already exited
    }
  }
});

test('runtime checks use the temp repo and leave the real checkout alone', () => {
  rmSync(scratchDir, { recursive: true, force: true });
  assert.equal(root, repo);
  assert.equal(
    exists(path.join(realRoot, '.agents/skills/convex-backup-test')),
    false,
  );
});
