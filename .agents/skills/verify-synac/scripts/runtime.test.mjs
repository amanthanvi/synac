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
} from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const state = `/tmp/synac-verify-test-${process.pid}`;
rmSync(state, { recursive: true, force: true });
mkdirSync(state, { recursive: true, mode: 0o700 });
chmodSync(state, 0o700);
process.env.SYNAC_VERIFY_STATE_DIR = state;
process.env.VERIFY_EVIDENCE_DIR = path.join(state, 'evidence');

const { root, ensureState, snapshotWatchedFiles, noteRunWrites, restoreOwnedWrites } =
  await import('./runtime.mjs');

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
