import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
import { test } from 'node:test';

const state = `/tmp/synac-verify-test-${process.pid}`;
rmSync(state, { recursive: true, force: true });
mkdirSync(state, { recursive: true, mode: 0o700 });
chmodSync(state, 0o700);
process.env.SYNAC_VERIFY_STATE_DIR = state;
process.env.VERIFY_EVIDENCE_DIR = path.join(state, 'evidence');

const {
  root,
  ensureState,
  snapshotWatchedFiles,
  noteRunWrites,
  restoreOwnedWrites,
  assertSnapshotCheckout,
} = await import('./runtime.mjs');

const scratchDir = path.join(root, '.agents/skills/convex-backup-test');
const linkRel = '.agents/skills/convex-backup-test/link.md';
const linkAbs = path.join(root, linkRel);

function backupId() {
  return readFileSync(path.join(state, 'snapshot/backup-id'), 'utf8').trim();
}

test('each snapshot stores backups in its own directory, including symlinks', () => {
  try {
    snapshotWatchedFiles();
    const firstId = backupId();
    mkdirSync(scratchDir, { recursive: true });
    symlinkSync('target.txt', linkAbs);
    noteRunWrites();
    const first = restoreOwnedWrites();
    const firstBackup = path.join(state, 'restored', firstId, linkRel);
    assert.equal(first.restored.includes(linkRel), true);
    assert.equal(lstatSync(firstBackup).isSymbolicLink(), true);
    assert.equal(readlinkSync(firstBackup), 'target.txt');
    assert.equal(exists(linkAbs), false);

    snapshotWatchedFiles();
    const secondId = backupId();
    assert.notEqual(secondId, firstId);
    mkdirSync(scratchDir, { recursive: true });
    symlinkSync('other.txt', linkAbs);
    noteRunWrites();
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

test('snapshot records this checkout and restore refuses a different root', () => {
  snapshotWatchedFiles();
  const manifestPath = path.join(state, 'snapshot/manifest.json');
  const original = readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(original);
  assert.equal(manifest.repoRoot, root);
  assert.equal(typeof manifest.files, 'object');
  const flat = { 'AGENTS.md': { kind: 'file', hash: 'abc', mode: 0o644 } };
  writeFileSync(manifestPath, `${JSON.stringify(flat)}\n`);
  assertSnapshotCheckout();
  assert.deepEqual(restoreOwnedWrites(), { restored: [], warned: [], backups: [] });
  writeFileSync(manifestPath, original);
  manifest.repoRoot = '/tmp/other-checkout';
  writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
  assert.throws(() => assertSnapshotCheckout(), /Refusing to restore/);
  assert.throws(() => restoreOwnedWrites(), /Refusing to restore/);
  writeFileSync(manifestPath, original);
  assertSnapshotCheckout();
});

test('restore keeps the executable bit and leaves hand-maintained edits', () => {
  const scriptRel = '.agents/skills/convex-backup-test/run.sh';
  const scriptAbs = path.join(root, scriptRel);
  const agents = path.join(root, 'AGENTS.md');
  const agentsOriginal = readFileSync(agents);
  try {
    mkdirSync(scratchDir, { recursive: true });
    writeFileSync(scriptAbs, '#!/bin/sh\necho snapshot\n');
    chmodSync(scriptAbs, 0o755);
    snapshotWatchedFiles();
    writeFileSync(scriptAbs, '#!/bin/sh\necho edited\n');
    chmodSync(scriptAbs, 0o644);
    writeFileSync(agents, Buffer.concat([agentsOriginal, Buffer.from('\nverify-human\n')]));
    noteRunWrites();
    const result = restoreOwnedWrites();
    assert.equal(readFileSync(scriptAbs, 'utf8'), '#!/bin/sh\necho snapshot\n');
    assert.equal(statSync(scriptAbs).mode & 0o777, 0o755);
    assert.equal(result.restored.includes(scriptRel), true);
    assert.equal(readFileSync(agents).equals(agentsOriginal), false);
    assert.equal(result.restored.includes('AGENTS.md'), false);
    assert.equal(result.warned.includes('AGENTS.md'), true);
  } finally {
    writeFileSync(agents, agentsOriginal);
    rmSync(scratchDir, { recursive: true, force: true });
  }
});

test('a convex skill file created after launch is recorded and warned', () => {
  const rel = '.agents/skills/convex-backup-test/SKILL.md';
  const abs = path.join(root, rel);
  const warnings = [];
  const orig = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    snapshotWatchedFiles();
    noteRunWrites();
    mkdirSync(scratchDir, { recursive: true });
    writeFileSync(abs, 'after launch\n');
    noteRunWrites({ later: true });
    const writes = JSON.parse(readFileSync(path.join(state, 'snapshot/writes.json'), 'utf8'));
    assert.equal(writes[rel].kind, 'file');
    assert.equal(
      warnings.some((line) => line.includes(`new convex skill file ${rel}`)),
      true,
    );
    restoreOwnedWrites();
    assert.equal(exists(abs), false);
  } finally {
    console.warn = orig;
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

function exists(file) {
  try {
    lstatSync(file);
    return true;
  } catch {
    return false;
  }
}

test('runtime checks leave the worktree clean', () => {
  rmSync(scratchDir, { recursive: true, force: true });
  const status = spawnSync('git', ['status', '--porcelain=v1', '--', linkRel], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(status.stdout, '');
});
