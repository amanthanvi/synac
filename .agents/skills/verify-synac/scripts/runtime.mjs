import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

export const root = path.resolve(scriptDir, '../../../..');
if (process.cwd() !== root) process.chdir(root);

const nextEnvFile = path.join(root, 'apps/web/next-env.d.ts');
const nextEnvMeta = 'next-env.meta.json';
const nextEnvSnapshot = 'next-env.snapshot';

const handMaintained = new Set([
  'AGENTS.md',
  'CLAUDE.md',
  'apps/web/AGENTS.md',
  'convex.json',
]);
export const stateDir = process.env.SYNAC_VERIFY_STATE_DIR ?? '/tmp/synac-verify';
export const evidenceDir =
  process.env.VERIFY_EVIDENCE_DIR ?? path.join(stateDir, 'evidence');
export const runFile = path.join(stateDir, 'run.json');
export const baseUrl = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';
export const webPort = 3000;
export const convexPort = 3210;
export const convexSitePort = 3211;
export const convexUrl = 'http://127.0.0.1:3210';
export const sessionConvex = 'synac-verify-convex';
export const sessionWeb = 'synac-verify-web';
export const ownedSessions = new Set([sessionConvex, sessionWeb]);

const tmuxConfig = process.env.SYNAC_VERIFY_TMUX_CONFIG
  ? process.env.SYNAC_VERIFY_TMUX_CONFIG
  : existsSync('/exec-daemon/tmux.portal.conf')
    ? '/exec-daemon/tmux.portal.conf'
    : '';

export function ensureState() {
  let created = false;
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    created = true;
  }
  const listed = lstatSync(stateDir);
  if (listed.isSymbolicLink() || !listed.isDirectory()) {
    throw new Error(`${stateDir} is not a private directory`);
  }
  const uid = typeof process.getuid === 'function' ? process.getuid() : null;
  if (uid !== null && listed.uid !== uid) {
    throw new Error(`${stateDir} is owned by uid ${listed.uid}, expected ${uid}`);
  }
  if (created) chmodSync(stateDir, 0o700);
  const mode = statSync(stateDir).mode & 0o777;
  if (mode !== 0o700) {
    throw new Error(
      `${stateDir} mode is 0${mode.toString(8)}, expected 0700. Refusing to change an existing directory.`,
    );
  }
  if (!existsSync(evidenceDir)) {
    mkdirSync(evidenceDir, { recursive: true, mode: 0o700 });
    chmodSync(evidenceDir, 0o700);
  }
}

export function readRun() {
  try {
    const value = JSON.parse(readFileSync(runFile, 'utf8'));
    if (!value || typeof value !== 'object') return emptyRun();
    const pids = value.pids && typeof value.pids === 'object' ? value.pids : {};
    return {
      sessions: Array.isArray(value.sessions) ? value.sessions : [],
      pids: {
        convex: normalizePid(pids.convex),
        web: normalizePid(pids.web),
        convexSite: normalizePid(pids.convexSite),
      },
      startedAt: typeof value.startedAt === 'string' ? value.startedAt : '',
      webMode: value.webMode === 'dev' ? 'dev' : 'start',
      baseUrl: typeof value.baseUrl === 'string' ? value.baseUrl : baseUrl,
      dirtyBefore: Array.isArray(value.dirtyBefore)
        ? value.dirtyBefore.filter((item) => typeof item === 'string')
        : undefined,
    };
  } catch {
    return emptyRun();
  }
}

function emptyRun() {
  return {
    sessions: [],
    pids: { convex: null, web: null, convexSite: null },
    startedAt: '',
    webMode: 'start',
    baseUrl,
  };
}

function normalizePid(value) {
  if (!value || typeof value !== 'object') return null;
  const pid = value.pid;
  if (!Number.isInteger(pid) || pid <= 1) return null;
  const startTime = typeof value.startTime === 'string' ? value.startTime : '';
  const cmdline = typeof value.cmdline === 'string' ? value.cmdline : '';
  if (!startTime && !cmdline) return null;
  return { pid, startTime, cmdline };
}

export function writeRun(run) {
  ensureState();
  writeFileSync(runFile, `${JSON.stringify(run, null, 2)}\n`);
}

export function shQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export function tmux(args, options = {}) {
  const prefix = tmuxConfig ? ['-f', tmuxConfig] : [];
  return spawnSync('tmux', [...prefix, ...args], {
    encoding: 'utf8',
    ...options,
  });
}

export function sessionAlive(name) {
  if (!ownedSessions.has(name)) return false;
  const result = tmux(['has-session', '-t', name], { stdio: 'ignore' });
  return result.status === 0;
}

export function startSession(name, script) {
  if (!ownedSessions.has(name)) {
    throw new Error(`refusing to start unknown session ${name}`);
  }
  const result = tmux(
    ['new-session', '-d', '-s', name, '-c', root, '--', 'bash', '-c', script],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) {
    throw new Error(`tmux new-session ${name} failed`);
  }
}

export function portOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (open) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(500, () => done(false));
  });
}

function parseProcNet(file, port) {
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const hex = port.toString(16).toUpperCase().padStart(4, '0');
  const inodes = [];
  for (const line of text.split('\n').slice(1)) {
    const cols = line.trim().split(/\s+/);
    const local = cols[1];
    const inode = cols[9];
    if (!local || !inode) continue;
    if (local.endsWith(`:${hex}`)) inodes.push(inode);
  }
  return inodes;
}

function pidForInode(inode) {
  let pids = [];
  try {
    pids = readdirSync('/proc').filter((name) => /^\d+$/.test(name));
  } catch {
    return null;
  }
  const needle = `socket:[${inode}]`;
  for (const pid of pids) {
    let fds = [];
    try {
      fds = readdirSync(`/proc/${pid}/fd`);
    } catch {
      continue;
    }
    for (const fd of fds) {
      try {
        if (readlinkSync(`/proc/${pid}/fd/${fd}`) === needle) return Number(pid);
      } catch {
        continue;
      }
    }
  }
  return null;
}

export function portOwner(port) {
  const inodes = [
    ...parseProcNet('/proc/net/tcp', port),
    ...parseProcNet('/proc/net/tcp6', port),
  ];
  const pids = [];
  for (const inode of inodes) {
    const pid = pidForInode(inode);
    if (pid && !pids.includes(pid)) pids.push(pid);
  }
  if (pids.length === 0) return 'none';
  return pids
    .map((pid) => {
      let cmd = '';
      try {
        cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim();
      } catch {
        cmd = '';
      }
      return cmd ? `${pid} ${cmd}` : String(pid);
    })
    .join('; ');
}

export function listenerPids(port) {
  const inodes = [
    ...parseProcNet('/proc/net/tcp', port),
    ...parseProcNet('/proc/net/tcp6', port),
  ];
  const pids = [];
  for (const inode of inodes) {
    const pid = pidForInode(inode);
    if (pid && !pids.includes(pid)) pids.push(pid);
  }
  return pids;
}

export async function waitFor(label, predicate, timeoutMs, intervalMs = 1000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`timed out waiting for ${label}`);
}

export function runLogged(command, args, logName, options = {}) {
  ensureState();
  const logPath = path.join(evidenceDir, logName);
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
    timeout: options.timeoutMs,
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const header = `$ ${command} ${args.join(' ')}\nexit ${result.status ?? 'null'}\n`;
  writeFileSync(logPath, `${header}\n${stdout}\n${stderr}`);
  return { status: result.status ?? 1, stdout, stderr, logPath, error: result.error };
}

export function nodeMajor() {
  return Number(process.versions.node.split('.')[0] ?? 0);
}

export function noteSession(session) {
  if (!ownedSessions.has(session)) {
    throw new Error(`refusing to record unknown session ${session}`);
  }
  const run = readRun();
  if (!run.sessions.includes(session)) run.sessions.push(session);
  run.baseUrl = baseUrl;
  run.webMode = process.env.VERIFY_WEB_MODE === 'dev' ? 'dev' : 'start';
  if (!run.startedAt) run.startedAt = new Date().toISOString();
  writeRun(run);
}

export function processIdentity(pid) {
  if (!Number.isInteger(pid) || pid <= 1) return null;
  let cmdline = '';
  try {
    cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf8').replaceAll('\0', ' ').trim();
  } catch {
    return null;
  }
  let startTime = '';
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const end = stat.lastIndexOf(')');
    if (end !== -1) {
      const fields = stat.slice(end + 2).trim().split(/\s+/);
      startTime = fields[19] ?? '';
    }
  } catch {
    startTime = '';
  }
  if (!cmdline && !startTime) return null;
  return { pid, startTime, cmdline };
}

export function sameProcess(saved, pid) {
  if (!saved || saved.pid !== pid) return false;
  const live = processIdentity(pid);
  if (!live) return false;
  if (saved.startTime && live.startTime) return saved.startTime === live.startTime;
  if (saved.cmdline && live.cmdline) return saved.cmdline === live.cmdline;
  return false;
}

export function rememberListener(pidKey, port) {
  const pid = listenerPids(port)[0];
  if (!pid) return;
  const identity = processIdentity(pid);
  if (!identity || (!identity.startTime && !identity.cmdline)) return;
  const run = readRun();
  run.pids[pidKey] = identity;
  writeRun(run);
}

function isHandMaintained(rel) {
  return handMaintained.has(rel);
}

function isRegenerated(rel) {
  if (rel === 'skills-lock.json' || rel === 'apps/web/next-env.d.ts') return true;
  if (rel.startsWith('.agents/skills/convex')) return true;
  if (rel === 'convex/_generated/ai' || rel.startsWith('convex/_generated/ai/')) return true;
  if (rel === '.cursor/rules/convex_rules.mdc') return true;
  return false;
}

function backupRel(rel) {
  const abs = path.join(root, rel);
  if (!existsSync(abs)) return null;
  const listed = lstatSync(abs);
  if (listed.isSymbolicLink()) return null;
  const dest = path.join(stateDir, 'restored', rel);
  mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
  if (listed.isDirectory()) cpSync(abs, dest, { recursive: true, dereference: false });
  else copyFileSync(abs, dest);
  return dest;
}

function worktreeEntries() {
  const result = spawnSync('git', ['status', '--porcelain=v1', '-uall'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`git status failed: ${result.stderr ?? ''}`.trim());
  }
  const entries = [];
  for (const line of (result.stdout ?? '').split('\n')) {
    if (!line) continue;
    const code = line.slice(0, 2);
    let rel = line.slice(3);
    if (rel.startsWith('"') && rel.endsWith('"')) rel = rel.slice(1, -1);
    if (rel.endsWith('/')) rel = rel.slice(0, -1);
    if (rel.includes(' -> ')) {
      const renamed = rel.split(' -> ').at(-1);
      if (renamed) rel = renamed;
    }
    entries.push({ code, rel });
  }
  return entries;
}

function snapshotNextEnv() {
  ensureState();
  const metaPath = path.join(stateDir, nextEnvMeta);
  const snapPath = path.join(stateDir, nextEnvSnapshot);
  if (!existsSync(nextEnvFile)) {
    writeFileSync(metaPath, `${JSON.stringify({ existed: false })}\n`);
    rmSync(snapPath, { force: true });
    return;
  }
  copyFileSync(nextEnvFile, snapPath);
  writeFileSync(metaPath, `${JSON.stringify({ existed: true })}\n`);
}

function restoreNextEnv() {
  const metaPath = path.join(stateDir, nextEnvMeta);
  if (!existsSync(metaPath)) return null;
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  const snapPath = path.join(stateDir, nextEnvSnapshot);
  const current = existsSync(nextEnvFile) ? readFileSync(nextEnvFile) : null;
  if (meta.existed !== true) {
    if (!current) return null;
    const dest = backupRel('apps/web/next-env.d.ts');
    rmSync(nextEnvFile, { force: true });
    return dest;
  }
  if (!existsSync(snapPath)) return null;
  const previous = readFileSync(snapPath);
  if (current && current.equals(previous)) return null;
  const dest = current ? backupRel('apps/web/next-env.d.ts') : null;
  copyFileSync(snapPath, nextEnvFile);
  return dest;
}

export function rememberWorktree() {
  const run = readRun();
  run.dirtyBefore = worktreeEntries().map((entry) => entry.rel);
  writeRun(run);
  snapshotNextEnv();
}

function removeUntracked(rel) {
  const cleaned = rel.replace(/\/+$/, '');
  const abs = path.join(root, cleaned);
  let listed;
  try {
    listed = lstatSync(abs);
  } catch {
    return;
  }
  if (listed.isSymbolicLink()) {
    rmSync(abs, { force: true });
  } else if (listed.isDirectory()) {
    const tracked = spawnSync('git', ['ls-files', '--', cleaned], {
      cwd: root,
      encoding: 'utf8',
    });
    if ((tracked.stdout ?? '').trim().length > 0) return;
    rmSync(abs, { recursive: true, force: true });
    return;
  } else {
    rmSync(abs, { force: true });
  }
  let parent = path.dirname(cleaned);
  while (parent && parent !== '.' && isRegenerated(parent)) {
    const tracked = spawnSync('git', ['ls-files', '--', parent], {
      cwd: root,
      encoding: 'utf8',
    });
    if ((tracked.stdout ?? '').trim().length > 0) break;
    const absParent = path.join(root, parent);
    let names = [];
    try {
      names = readdirSync(absParent);
    } catch {
      break;
    }
    if (names.length > 0) break;
    rmdirSync(absParent);
    parent = path.dirname(parent);
  }
}

export function restoreGeneratedDrift() {
  const run = readRun();
  if (!Array.isArray(run.dirtyBefore)) return { restored: [], warned: [], backups: [] };
  const before = new Set(run.dirtyBefore);
  const restore = [];
  const remove = [];
  const warned = [];
  for (const entry of worktreeEntries()) {
    if (before.has(entry.rel)) continue;
    if (isHandMaintained(entry.rel)) {
      warned.push(entry.rel);
      continue;
    }
    if (!isRegenerated(entry.rel)) continue;
    if (entry.code === '??') remove.push(entry.rel);
    else restore.push(entry.rel);
  }
  const backups = [];
  for (const rel of [...restore, ...remove]) {
    const dest = backupRel(rel);
    if (dest) backups.push({ rel, dest });
  }
  if (restore.length > 0) {
    const result = spawnSync('git', ['restore', '--source=HEAD', '--worktree', '--', ...restore], {
      cwd: root,
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      throw new Error(`git restore failed: ${result.stderr ?? ''}`.trim());
    }
  }
  for (const rel of [...remove].sort((a, b) => b.length - a.length)) removeUntracked(rel);
  const nextEnvBackup = restoreNextEnv();
  if (nextEnvBackup) backups.push({ rel: 'apps/web/next-env.d.ts', dest: nextEnvBackup });
  for (const item of backups) console.log(`backed up ${item.rel} to ${item.dest}`);
  const restored = [...restore, ...remove];
  if (restored.length > 0) console.log(`restored generated files: ${restored.join(', ')}`);
  for (const rel of warned) {
    console.warn(`warning: ${rel} changed during the run and was left in place`);
  }
  return { restored, warned, backups };
}
