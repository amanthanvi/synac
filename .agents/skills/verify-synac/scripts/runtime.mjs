import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

export const root = path.resolve(scriptDir, '../../../..');
if (process.cwd() !== root) process.chdir(root);

const namedWatched = [
  'AGENTS.md',
  'CLAUDE.md',
  'apps/web/AGENTS.md',
  'apps/web/CLAUDE.md',
  'convex.json',
  'skills-lock.json',
  'apps/web/next-env.d.ts',
  '.cursor/rules/convex_rules.mdc',
];

const snapshotDirName = 'snapshot';
let tookSnapshot = false;
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

function assertPrivateDir(dir, created) {
  const listed = lstatSync(dir);
  if (listed.isSymbolicLink() || !listed.isDirectory()) {
    throw new Error(`${dir} is not a private directory`);
  }
  const uid = typeof process.getuid === 'function' ? process.getuid() : null;
  if (uid !== null && listed.uid !== uid) {
    throw new Error(`${dir} is owned by uid ${listed.uid}, expected ${uid}`);
  }
  if (created) chmodSync(dir, 0o700);
  const mode = statSync(dir).mode & 0o777;
  if (mode !== 0o700) {
    throw new Error(
      `${dir} mode is 0${mode.toString(8)}, expected 0700. Refusing to change an existing directory.`,
    );
  }
}

function preparePrivateDir(dir) {
  let created = false;
  try {
    lstatSync(dir);
  } catch {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    created = true;
  }
  assertPrivateDir(dir, created);
}

export function ensureState() {
  preparePrivateDir(stateDir);
  preparePrivateDir(evidenceDir);
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

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function gitBlob(spec) {
  const result = spawnSync('git', ['rev-parse', '-q', '--verify', spec], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) return null;
  const value = (result.stdout ?? '').trim();
  return value || null;
}

function stagedRecord(rel) {
  const indexHash = gitBlob(`:${rel}`);
  const headHash = gitBlob(`HEAD:${rel}`);
  return { indexHash, headHash, staged: indexHash !== headHash };
}

function describeWorktree(rel) {
  const abs = path.join(root, rel);
  let listed;
  try {
    listed = lstatSync(abs);
  } catch {
    return { kind: 'absent', hash: null };
  }
  if (listed.isSymbolicLink()) {
    const target = readlinkSync(abs);
    return { kind: 'symlink', hash: sha256Bytes(target), target };
  }
  if (!listed.isFile()) return { kind: 'other', hash: null };
  return { kind: 'file', hash: sha256Bytes(readFileSync(abs)) };
}

function walkFiles(dir, prefix) {
  let names = [];
  try {
    names = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const rels = [];
  for (const name of names) {
    const rel = `${prefix}/${name.name}`;
    const abs = path.join(dir, name.name);
    if (name.isDirectory()) rels.push(...walkFiles(abs, rel));
    else if (name.isFile() || name.isSymbolicLink()) rels.push(rel);
  }
  return rels;
}

function watchedRels() {
  const rels = new Set(namedWatched);
  const skills = path.join(root, '.agents/skills');
  let skillNames = [];
  try {
    skillNames = readdirSync(skills, { withFileTypes: true });
  } catch {
    skillNames = [];
  }
  for (const name of skillNames) {
    if (!name.isDirectory() || !name.name.startsWith('convex')) continue;
    for (const rel of walkFiles(path.join(skills, name.name), `.agents/skills/${name.name}`)) {
      rels.add(rel);
    }
  }
  for (const rel of walkFiles(path.join(root, 'convex/_generated/ai'), 'convex/_generated/ai')) {
    rels.add(rel);
  }
  return [...rels];
}

function snapshotRoot() {
  return path.join(stateDir, snapshotDirName);
}

function manifestPath() {
  return path.join(snapshotRoot(), 'manifest.json');
}

function writesPath() {
  return path.join(snapshotRoot(), 'writes.json');
}

function contentPath(rel) {
  return path.join(snapshotRoot(), 'files', rel);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function sameDescribed(left, right) {
  return left.kind === right.kind && left.hash === right.hash;
}

function safeRel(rel) {
  if (typeof rel !== 'string' || rel.length === 0 || path.isAbsolute(rel)) return false;
  if (rel.includes('\\') || rel.split('/').includes('..')) return false;
  return true;
}

function backupRunDir() {
  const idFile = path.join(snapshotRoot(), 'backup-id');
  let id = 'unknown';
  try {
    const raw = readFileSync(idFile, 'utf8').trim();
    if (/^[\w.-]+$/.test(raw)) id = raw;
  } catch {
    id = 'unknown';
  }
  const dir = path.join(stateDir, 'restored', id);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  return dir;
}

function backupRel(rel) {
  const abs = path.join(root, rel);
  let listed;
  try {
    listed = lstatSync(abs);
  } catch {
    return null;
  }
  const dest = path.join(backupRunDir(), rel);
  mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
  rmSync(dest, { recursive: true, force: true });
  if (listed.isSymbolicLink()) {
    symlinkSync(readlinkSync(abs), dest);
    return dest;
  }
  if (listed.isDirectory()) return null;
  if (!listed.isFile()) return null;
  copyFileSync(abs, dest);
  return dest;
}

function absentRecord() {
  return {
    kind: 'absent',
    hash: null,
    indexHash: null,
    headHash: null,
    staged: false,
  };
}

function trackedInGit(rel) {
  const result = spawnSync('git', ['ls-files', '--', rel], {
    cwd: root,
    encoding: 'utf8',
  });
  return (result.stdout ?? '').trim().length > 0;
}

function pruneEmptyConvexSkillDirs(rel) {
  let parent = path.dirname(rel);
  while (parent && parent !== '.' && parent.startsWith('.agents/skills/convex')) {
    if (trackedInGit(parent)) break;
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

function placeSnapshot(rel, snap) {
  const abs = path.join(root, rel);
  let listed = null;
  try {
    listed = lstatSync(abs);
  } catch {
    listed = null;
  }
  if (listed?.isDirectory()) return false;
  if (snap.kind === 'absent') {
    if (!listed) return true;
    rmSync(abs, { force: true });
    pruneEmptyConvexSkillDirs(rel);
    return true;
  }
  if (snap.kind === 'symlink') {
    if (typeof snap.target !== 'string') return false;
    if (listed) rmSync(abs, { force: true });
    mkdirSync(path.dirname(abs), { recursive: true });
    symlinkSync(snap.target, abs);
    return true;
  }
  if (snap.kind !== 'file') return false;
  const src = contentPath(rel);
  if (!existsSync(src)) return false;
  if (listed?.isSymbolicLink()) rmSync(abs, { force: true });
  mkdirSync(path.dirname(abs), { recursive: true });
  copyFileSync(src, abs);
  return true;
}

export function snapshotWatchedFiles() {
  ensureState();
  const staging = path.join(stateDir, `${snapshotDirName}.next`);
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(path.join(staging, 'files'), { recursive: true, mode: 0o700 });
  const manifest = {};
  for (const rel of watchedRels()) {
    if (!safeRel(rel)) continue;
    const described = describeWorktree(rel);
    if (described.kind === 'file') {
      const bytes = readFileSync(path.join(root, rel));
      described.hash = sha256Bytes(bytes);
      const dest = path.join(staging, 'files', rel);
      mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
      writeFileSync(dest, bytes);
    }
    manifest[rel] = { ...described, ...stagedRecord(rel) };
  }
  writeFileSync(path.join(staging, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(path.join(staging, 'writes.json'), '{}\n');
  const backupId = new Date().toISOString().replace(/[:.]/g, '-');
  writeFileSync(path.join(staging, 'backup-id'), `${backupId}\n`);
  const previous = path.join(stateDir, `${snapshotDirName}.prev`);
  rmSync(previous, { recursive: true, force: true });
  if (existsSync(snapshotRoot())) renameSync(snapshotRoot(), previous);
  renameSync(staging, snapshotRoot());
  rmSync(previous, { recursive: true, force: true });
  tookSnapshot = true;
}

export function noteRunWrites() {
  if (!tookSnapshot) return;
  const manifest = readJson(manifestPath(), null);
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return;
  const writes = {};
  const rels = new Set([...Object.keys(manifest), ...watchedRels()]);
  for (const rel of rels) {
    if (!safeRel(rel)) continue;
    const current = describeWorktree(rel);
    const snap = manifest[rel];
    const snapDescribed = snap
      ? { kind: snap.kind, hash: snap.hash ?? null }
      : { kind: 'absent', hash: null };
    if (sameDescribed(current, snapDescribed)) continue;
    writes[rel] = { kind: current.kind, hash: current.hash };
  }
  writeFileSync(writesPath(), `${JSON.stringify(writes, null, 2)}\n`);
}

export function restoreOwnedWrites() {
  const manifest = readJson(manifestPath(), null);
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { restored: [], warned: [], backups: [] };
  }
  const writes = readJson(writesPath(), {});
  const writeMap = writes && typeof writes === 'object' && !Array.isArray(writes) ? writes : {};
  const rels = new Set([...Object.keys(manifest), ...Object.keys(writeMap)]);
  const restored = [];
  const warned = [];
  const backups = [];
  for (const rel of rels) {
    if (!safeRel(rel)) continue;
    const snap = manifest[rel] ?? absentRecord();
    const liveStage = stagedRecord(rel);
    const snapIndex = typeof snap.indexHash === 'string' ? snap.indexHash : null;
    const snapStaged = snap.staged === true;
    if (liveStage.indexHash !== snapIndex || liveStage.staged !== snapStaged) {
      warned.push(rel);
      console.warn(`warning: ${rel} staged state changed during the run and was left in place`);
      continue;
    }
    const current = describeWorktree(rel);
    if (sameDescribed(current, { kind: snap.kind, hash: snap.hash ?? null })) continue;
    const write = writeMap[rel];
    const owned =
      write &&
      typeof write === 'object' &&
      sameDescribed(current, { kind: write.kind, hash: write.hash ?? null });
    if (!owned) {
      warned.push(rel);
      console.warn(`warning: ${rel} changed during the run and was left in place`);
      continue;
    }
    const dest = backupRel(rel);
    if (dest) {
      backups.push({ rel, dest });
      console.log(`backed up ${rel} to ${dest}`);
    }
    if (!placeSnapshot(rel, snap)) {
      warned.push(rel);
      console.warn(`warning: ${rel} changed during the run and was left in place`);
      continue;
    }
    restored.push(rel);
    console.log(`restored ${rel} to launch snapshot`);
  }
  return { restored, warned, backups };
}
