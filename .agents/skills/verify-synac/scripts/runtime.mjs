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
  realpathSync,
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

export const root = path.resolve(
  process.env.SYNAC_VERIFY_ROOT ?? path.resolve(scriptDir, '../../../..'),
);
if (process.cwd() !== root) process.chdir(root);

function canonicalRoot(repoRoot) {
  const resolved = path.resolve(repoRoot);
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}

export function checkoutKey(repoRoot) {
  return createHash('sha256')
    .update(canonicalRoot(repoRoot))
    .digest('hex')
    .slice(0, 12);
}

export function stateDirFor(repoRoot) {
  return path.join('/tmp', `synac-verify-${checkoutKey(repoRoot)}`);
}

export function sessionsFor(repoRoot) {
  const key = checkoutKey(repoRoot);
  return {
    convex: `synac-v-${key}-convex`,
    web: `synac-v-${key}-web`,
  };
}

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

const handMaintained = new Set([
  'AGENTS.md',
  'CLAUDE.md',
  'apps/web/CLAUDE.md',
  'convex.json',
]);

const snapshotDirName = 'snapshot';
let tookSnapshot = false;
let launchOpen = false;
export const stateDir = process.env.SYNAC_VERIFY_STATE_DIR ?? stateDirFor(root);
export const evidenceDir =
  process.env.VERIFY_EVIDENCE_DIR ?? path.join(stateDir, 'evidence');
export const runFile = path.join(stateDir, 'run.json');
export const baseUrl = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';

function portFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^[1-9][0-9]*$/.test(raw)) return fallback;
  const value = Number(raw);
  if (value > 65535) return fallback;
  return value;
}

export function listenWebPort() {
  return portFromEnv('SYNAC_VERIFY_WEB_PORT', 3000);
}

export function listenConvexPort() {
  return portFromEnv('SYNAC_VERIFY_CONVEX_PORT', 3210);
}

export function listenConvexSitePort() {
  return portFromEnv('SYNAC_VERIFY_CONVEX_SITE_PORT', 3211);
}

export const webPort = listenWebPort();
export const convexPort = listenConvexPort();
export const convexSitePort = listenConvexSitePort();
export const convexUrl = `http://127.0.0.1:${convexPort}`;
const ownSessions = sessionsFor(root);
export const sessionConvex = ownSessions.convex;
export const sessionWeb = ownSessions.web;
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

function readRunFile() {
  if (!existsSync(runFile)) return { status: 'missing' };
  let raw;
  try {
    raw = JSON.parse(readFileSync(runFile, 'utf8'));
  } catch {
    return { status: 'unreadable' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return { status: 'unreadable' };
  const repoRoot = typeof raw.repoRoot === 'string' ? raw.repoRoot : '';
  if (!repoRoot) return { status: 'legacy' };
  if (repoRoot !== root) return { status: 'foreign', repoRoot };
  return { status: 'ok' };
}

function backupRunFile() {
  const id = `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const dir = path.join(stateDir, 'restored', id);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const dest = path.join(dir, 'run.json');
  copyFileSync(runFile, dest);
  return dest;
}

export function readRun() {
  const identity = readRunFile();
  if (identity.status === 'legacy' || identity.status === 'unreadable')
    return emptyRun();
  try {
    const value = JSON.parse(readFileSync(runFile, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return emptyRun();
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
      repoRoot: typeof value.repoRoot === 'string' ? value.repoRoot : '',
      head: typeof value.head === 'string' ? value.head : '',
      diffHash: typeof value.diffHash === 'string' ? value.diffHash : '',
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
    repoRoot: '',
    head: '',
    diffHash: '',
  };
}

function normalizePid(value) {
  if (!value || typeof value !== 'object') return null;
  const pid = value.pid;
  if (!Number.isInteger(pid) || pid <= 1) return null;
  const startTime = typeof value.startTime === 'string' ? value.startTime : '';
  const argv0 = typeof value.argv0 === 'string' ? value.argv0 : '';
  const cmdlineHash =
    typeof value.cmdlineHash === 'string' ? value.cmdlineHash : '';
  if (!startTime && !argv0 && !cmdlineHash) return null;
  return { pid, startTime, argv0, cmdlineHash };
}

function storedPid(value) {
  const normalized = normalizePid(value);
  if (!normalized) return null;
  return {
    pid: normalized.pid,
    startTime: normalized.startTime,
    argv0: normalized.argv0,
    cmdlineHash: normalized.cmdlineHash,
  };
}

export function writeRun(run) {
  ensureState();
  const identity = readRunFile();
  if (identity.status === 'legacy' || identity.status === 'unreadable') {
    const dest = backupRunFile();
    console.warn(
      `warning: run state has no checkout identity. Backed up the run state to ${dest}.`,
    );
  }
  const pids = run.pids && typeof run.pids === 'object' ? run.pids : {};
  const next = {
    ...run,
    repoRoot:
      typeof run.repoRoot === 'string' && run.repoRoot ? run.repoRoot : root,
    head: typeof run.head === 'string' ? run.head : '',
    diffHash: typeof run.diffHash === 'string' ? run.diffHash : '',
    pids: {
      convex: storedPid(pids.convex),
      web: storedPid(pids.web),
      convexSite: storedPid(pids.convexSite),
    },
  };
  writeFileSync(runFile, `${JSON.stringify(next, null, 2)}\n`);
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
        if (readlinkSync(`/proc/${pid}/fd/${fd}`) === needle)
          return Number(pid);
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
        cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8')
          .replace(/\0/g, ' ')
          .trim();
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
  return {
    status: result.status ?? 1,
    stdout,
    stderr,
    logPath,
    error: result.error,
  };
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
  run.repoRoot = root;
  writeRun(run);
}

export function processIdentity(pid) {
  if (!Number.isInteger(pid) || pid <= 1) return null;
  let raw;
  try {
    raw = readFileSync(`/proc/${pid}/cmdline`);
  } catch {
    return null;
  }
  const cmdlineHash = createHash('sha256').update(raw).digest('hex');
  const zero = raw.indexOf(0);
  const argv0 = (zero === -1 ? raw : raw.subarray(0, zero)).toString('utf8');
  let startTime = '';
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const end = stat.lastIndexOf(')');
    if (end !== -1) {
      const fields = stat
        .slice(end + 2)
        .trim()
        .split(/\s+/);
      startTime = fields[19] ?? '';
    }
  } catch {
    startTime = '';
  }
  if (!argv0 && !startTime && !cmdlineHash) return null;
  return { pid, startTime, argv0, cmdlineHash };
}

export function sameProcess(saved, pid) {
  if (!saved || saved.pid !== pid) return false;
  const live = processIdentity(pid);
  if (!live) return false;
  if (saved.startTime && live.startTime)
    return saved.startTime === live.startTime;
  if (saved.cmdlineHash && live.cmdlineHash)
    return saved.cmdlineHash === live.cmdlineHash;
  if (saved.argv0 && live.argv0) return saved.argv0 === live.argv0;
  return false;
}

function childPids(pid) {
  const file = `/proc/${pid}/task/${pid}/children`;
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .trim()
    .split(/\s+/)
    .map((part) => Number(part))
    .filter((child) => Number.isInteger(child) && child > 1);
}

function signalTree(pid, signal) {
  for (const child of childPids(pid)) signalTree(child, signal);
  try {
    process.kill(pid, signal);
  } catch {
    return;
  }
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function processState(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const end = stat.lastIndexOf(')');
    if (end === -1) return '';
    return (
      stat
        .slice(end + 2)
        .trim()
        .split(/\s+/)[0] ?? ''
    );
  } catch {
    return '';
  }
}

function deadProcess(pid) {
  return !processIdentity(pid) || processState(pid) === 'Z';
}

export function stopRecordedPid(saved, graceMs = 2000) {
  if (!saved || !Number.isInteger(saved.pid) || saved.pid <= 1) return 'skip';
  if (deadProcess(saved.pid)) return 'exited';
  if (!sameProcess(saved, saved.pid)) return 'reused';
  signalTree(saved.pid, 'SIGTERM');
  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline) {
    if (deadProcess(saved.pid)) return 'term';
    sleepMs(50);
  }
  if (deadProcess(saved.pid)) return 'term';
  if (!sameProcess(saved, saved.pid)) return 'reused-before-kill';
  signalTree(saved.pid, 'SIGKILL');
  return 'kill';
}

export function rememberListener(pidKey, port) {
  const pid = listenerPids(port)[0];
  if (!pid) return;
  const identity = processIdentity(pid);
  if (
    !identity ||
    (!identity.startTime && !identity.argv0 && !identity.cmdlineHash)
  )
    return;
  const run = readRun();
  run.pids[pidKey] = identity;
  writeRun(run);
}

export function ownsRecordedListener(session, saved, port) {
  if (!sessionAlive(session) || !saved) return false;
  return listenerPids(port).some((pid) => sameProcess(saved, pid));
}

function gitOutput(args) {
  const result = spawnSync('git', args, {
    cwd: root,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0 || result.error) return null;
  return result.stdout ?? Buffer.alloc(0);
}

function hashWorktreeFile(hash, rel) {
  if (!safeRel(rel)) return false;
  let info;
  try {
    info = lstatSync(path.join(root, rel));
  } catch {
    return false;
  }
  hash.update(rel);
  hash.update('\0');
  if (info.isSymbolicLink()) {
    hash.update('symlink\0');
    try {
      hash.update(readlinkSync(path.join(root, rel)));
    } catch {
      return false;
    }
  } else if (info.isFile()) {
    hash.update('file\0');
    try {
      hash.update(readFileSync(path.join(root, rel)));
    } catch {
      return false;
    }
  } else {
    hash.update('other\0');
    hash.update(String(info.mode));
  }
  hash.update('\0');
  return true;
}

export function checkoutRevision() {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  });
  const headValue = head.status === 0 ? (head.stdout ?? '').trim() : '';
  const diffBytes = gitOutput(['diff', '--no-ext-diff', 'HEAD']);
  const statusBytes = gitOutput(['status', '--porcelain=v1', '-uall']);
  const untracked = gitOutput(['ls-files', '-o', '--exclude-standard', '-z']);
  if (diffBytes === null || statusBytes === null || untracked === null) {
    return { head: headValue, diffHash: '' };
  }
  const hash = createHash('sha256');
  hash.update('diff\0');
  hash.update(diffBytes);
  hash.update('\0status\0');
  hash.update(statusBytes);
  hash.update('\0untracked\0');
  const paths = [
    ...new Set(
      untracked
        .toString('utf8')
        .split('\0')
        .filter((rel) => rel.length > 0),
    ),
  ].sort();
  for (const rel of paths) {
    if (!hashWorktreeFile(hash, rel)) return { head: headValue, diffHash: '' };
  }
  return { head: headValue, diffHash: hash.digest('hex') };
}

export function checkoutMatchesRun(run = readRun()) {
  if (!run.head || !run.diffHash) return false;
  const current = checkoutRevision();
  return current.head === run.head && current.diffHash === run.diffHash;
}

export function recordCheckoutRevision() {
  const run = readRun();
  const revision = checkoutRevision();
  run.head = revision.head;
  run.diffHash = revision.diffHash;
  writeRun(run);
  return revision;
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
  return {
    kind: 'file',
    hash: sha256Bytes(readFileSync(abs)),
    mode: listed.mode & 0o777,
  };
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
    for (const rel of walkFiles(
      path.join(skills, name.name),
      `.agents/skills/${name.name}`,
    )) {
      rels.add(rel);
    }
  }
  for (const rel of walkFiles(
    path.join(root, 'convex/_generated/ai'),
    'convex/_generated/ai',
  )) {
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
  if (typeof rel !== 'string' || rel.length === 0 || path.isAbsolute(rel))
    return false;
  if (rel.includes('\\') || rel.split('/').includes('..')) return false;
  return true;
}

function readBackupId() {
  const idFile = path.join(snapshotRoot(), 'backup-id');
  try {
    const raw = readFileSync(idFile, 'utf8').trim();
    if (/^[\w.-]+$/.test(raw) && raw !== 'unknown') return raw;
  } catch {
    return null;
  }
  return null;
}

let restoreBackupDir = null;

function beginRestoreBackup() {
  const id =
    readBackupId() ??
    `restore-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const dir = path.join(stateDir, 'restored', id);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  restoreBackupDir = dir;
  return dir;
}

function endRestoreBackup() {
  restoreBackupDir = null;
}

function backupRunDir() {
  if (!restoreBackupDir) beginRestoreBackup();
  return restoreBackupDir;
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
  while (
    parent &&
    parent !== '.' &&
    parent.startsWith('.agents/skills/convex')
  ) {
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
  if (typeof snap.mode === 'number') chmodSync(abs, snap.mode);
  return true;
}

export function snapshotWatchedFiles() {
  launchOpen = false;
  ensureState();
  const staging = path.join(stateDir, `${snapshotDirName}.next`);
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(path.join(staging, 'files'), { recursive: true, mode: 0o700 });
  const files = {};
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
    files[rel] = { ...described, ...stagedRecord(rel) };
  }
  const manifest = { repoRoot: root, files };
  writeFileSync(
    path.join(staging, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  writeFileSync(path.join(staging, 'writes.json'), '{}\n');
  const backupId = new Date().toISOString().replace(/[:.]/g, '-');
  writeFileSync(path.join(staging, 'backup-id'), `${backupId}\n`);
  const previous = path.join(stateDir, `${snapshotDirName}.prev`);
  rmSync(previous, { recursive: true, force: true });
  if (existsSync(snapshotRoot())) renameSync(snapshotRoot(), previous);
  renameSync(staging, snapshotRoot());
  rmSync(previous, { recursive: true, force: true });
  tookSnapshot = true;
  stepBaseline = null;
}

function loadManifest() {
  if (!existsSync(manifestPath())) return { status: 'missing' };
  let raw;
  try {
    raw = JSON.parse(readFileSync(manifestPath(), 'utf8'));
  } catch {
    return { status: 'unreadable' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return { status: 'unreadable' };
  if (
    typeof raw.repoRoot !== 'string' ||
    !raw.files ||
    typeof raw.files !== 'object' ||
    Array.isArray(raw.files)
  ) {
    return { status: 'legacy' };
  }
  if (raw.repoRoot !== root)
    return { status: 'foreign', repoRoot: raw.repoRoot };
  return { status: 'ok', raw };
}

function readManifest() {
  const loaded = loadManifest();
  if (loaded.status !== 'ok') return null;
  return loaded.raw;
}

function clearSnapshotHint() {
  return `Remove ${snapshotRoot()} or move it aside, then launch again.`;
}

export function assertSnapshotCheckout() {
  const loaded = loadManifest();
  if (loaded.status === 'missing' || loaded.status === 'ok') return;
  if (loaded.status === 'foreign') {
    throw new Error(
      `snapshot repo root is ${loaded.repoRoot}, this checkout is ${root}. Refusing to launch. ${clearSnapshotHint()}`,
    );
  }
  if (loaded.status === 'legacy') {
    throw new Error(
      `snapshot manifest has no checkout identity. Refusing to launch. ${clearSnapshotHint()}`,
    );
  }
  throw new Error(
    `snapshot manifest is unreadable. Refusing to launch. ${clearSnapshotHint()}`,
  );
}

function backupRejectedManifest() {
  const id = `manifest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const dir = path.join(stateDir, 'restored', id);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const dest = path.join(dir, 'manifest.json');
  copyFileSync(manifestPath(), dest);
  return dest;
}

export function beginCleanup() {
  const loaded = loadManifest();
  const stopOwn = runBelongsToCheckout();
  if (loaded.status === 'missing' || loaded.status === 'ok') {
    return { restore: loaded.status === 'ok', stopOwn, backup: null };
  }
  const dest = backupRejectedManifest();
  const why =
    loaded.status === 'foreign'
      ? `snapshot repo root is ${loaded.repoRoot}, this checkout is ${root}`
      : loaded.status === 'legacy'
        ? 'snapshot manifest has no checkout identity'
        : 'snapshot manifest is unreadable';
  console.warn(
    `warning: ${why}. Leaving files in place. Backed up the manifest to ${dest}.`,
  );
  return { restore: false, stopOwn, backup: dest };
}

export function runBelongsToCheckout() {
  const identity = readRunFile();
  if (identity.status === 'missing' || identity.status === 'ok') return true;
  if (identity.status === 'foreign') {
    console.warn(
      `warning: run state is for ${identity.repoRoot}, this checkout is ${root}. Not stopping those processes.`,
    );
    return false;
  }
  const dest = backupRunFile();
  const why =
    identity.status === 'legacy'
      ? 'run state has no checkout identity'
      : 'run state is unreadable';
  console.warn(
    `warning: ${why}. Not stopping those processes. Backed up the run state to ${dest}.`,
  );
  return false;
}

function isNewConvexSkill(rel, snap) {
  return (
    rel.startsWith('.agents/skills/convex') && (!snap || snap.kind === 'absent')
  );
}

function toolOwns(tool, rel) {
  if (tool === 'convex') {
    return (
      rel === 'skills-lock.json' ||
      rel === '.cursor/rules/convex_rules.mdc' ||
      rel.startsWith('.agents/skills/convex') ||
      rel.startsWith('convex/_generated/ai/')
    );
  }
  if (tool === 'next') {
    return rel === 'apps/web/AGENTS.md' || rel === 'apps/web/next-env.d.ts';
  }
  return false;
}

function readWriteMap() {
  const writes = readJson(writesPath(), {});
  if (!writes || typeof writes !== 'object' || Array.isArray(writes)) return {};
  return { ...writes };
}

function snapDescribed(files, rel) {
  const snap = files[rel];
  return snap
    ? { kind: snap.kind, hash: snap.hash ?? null }
    : { kind: 'absent', hash: null };
}

function writeRecord(current, tool) {
  return { kind: current.kind, hash: current.hash, tool };
}

function recordedWriteMatches(write, current) {
  return (
    write &&
    typeof write === 'object' &&
    sameDescribed(current, { kind: write.kind, hash: write.hash ?? null })
  );
}

let stepBaseline = null;

function describedMap() {
  const manifest = readManifest();
  if (!manifest) return null;
  const described = {};
  const rels = new Set([...Object.keys(manifest.files), ...watchedRels()]);
  for (const rel of rels) {
    if (!safeRel(rel)) continue;
    const current = describeWorktree(rel);
    described[rel] = { kind: current.kind, hash: current.hash };
  }
  return { files: manifest.files, described };
}

export function markStepBaseline() {
  const mapped = describedMap();
  stepBaseline = mapped ? mapped.described : null;
}

export function captureToolWrites(tool) {
  if (tool !== 'convex' && tool !== 'next') {
    throw new Error(`unknown verify tool ${tool}`);
  }
  const before = stepBaseline;
  const mapped = describedMap();
  if (!before || !mapped) return;
  const { files, described } = mapped;
  const writeMap = readWriteMap();
  for (const rel of Object.keys(described)) {
    if (handMaintained.has(rel) || !toolOwns(tool, rel)) continue;
    const current = described[rel];
    const priorStep = before[rel] ?? { kind: 'absent', hash: null };
    if (!current || sameDescribed(current, priorStep)) continue;
    if (sameDescribed(current, snapDescribed(files, rel))) {
      delete writeMap[rel];
      writeFileSync(writesPath(), `${JSON.stringify(writeMap, null, 2)}\n`);
      continue;
    }
    if (isNewConvexSkill(rel, files[rel]))
      console.warn(`warning: new convex skill file ${rel}`);
    writeMap[rel] = writeRecord(current, tool);
    writeFileSync(writesPath(), `${JSON.stringify(writeMap, null, 2)}\n`);
  }
  stepBaseline = described;
}

function observedPath() {
  return path.join(snapshotRoot(), 'observed.json');
}

export function markObserved() {
  launchOpen = false;
  if (!tookSnapshot) return;
  const manifest = readManifest();
  if (!manifest) return;
  const observed = {};
  const rels = new Set([...Object.keys(manifest.files), ...watchedRels()]);
  for (const rel of rels) {
    if (!safeRel(rel)) continue;
    const current = describeWorktree(rel);
    observed[rel] = { kind: current.kind, hash: current.hash };
  }
  writeFileSync(observedPath(), `${JSON.stringify(observed, null, 2)}\n`);
}

export function finishLaunchSnapshot() {
  markObserved();
  if (!tookSnapshot) return;
  warnUnclaimedChanges();
}

export function noteWritesSinceObserved() {
  const manifest = readManifest();
  if (!manifest) return;
  const observed = readJson(observedPath(), null);
  if (!observed || typeof observed !== 'object' || Array.isArray(observed))
    return;
  const files = manifest.files;
  const rels = new Set([
    ...Object.keys(files),
    ...watchedRels(),
    ...Object.keys(observed),
  ]);
  for (const rel of rels) {
    if (!safeRel(rel) || handMaintained.has(rel)) continue;
    if (!toolOwns('convex', rel) && !toolOwns('next', rel)) continue;
    const current = describeWorktree(rel);
    const seen = observed[rel];
    const seenDescribed =
      seen && typeof seen === 'object'
        ? { kind: seen.kind, hash: seen.hash ?? null }
        : { kind: 'absent', hash: null };
    if (sameDescribed(current, seenDescribed)) continue;
    if (isNewConvexSkill(rel, files[rel]))
      console.warn(`warning: new convex skill file ${rel}`);
  }
}

export function warnUnclaimedChanges() {
  const manifest = readManifest();
  if (!manifest) return;
  const files = manifest.files;
  const writeMap = readWriteMap();
  const rels = new Set([...Object.keys(files), ...watchedRels()]);
  for (const rel of rels) {
    if (!safeRel(rel)) continue;
    const current = describeWorktree(rel);
    if (sameDescribed(current, snapDescribed(files, rel))) continue;
    const write = writeMap[rel];
    if (
      write &&
      typeof write === 'object' &&
      sameDescribed(current, { kind: write.kind, hash: write.hash ?? null })
    ) {
      continue;
    }
    console.warn(
      `warning: ${rel} changed during the run and was left in place`,
    );
  }
}

function priorRunUnfinished() {
  if (existsSync(observedPath())) return false;
  return loadManifest().status === 'ok';
}

export function restoreUnfinishedRun() {
  if (!priorRunUnfinished()) return { restored: [] };
  console.warn(
    'warning: previous launch did not finish. Restoring tool-owned files from its snapshot.',
  );
  try {
    return restoreUnfinishedInner();
  } finally {
    endRestoreBackup();
  }
}

function restoreUnfinishedInner() {
  const manifest = readManifest();
  if (!manifest) return { restored: [] };
  const files = manifest.files;
  const writeMap = readWriteMap();
  const restored = [];
  for (const rel of Object.keys(writeMap)) {
    if (!safeRel(rel) || handMaintained.has(rel)) continue;
    if (!toolOwns('convex', rel) && !toolOwns('next', rel)) continue;
    const snap = files[rel] ?? absentRecord();
    const current = describeWorktree(rel);
    if (sameDescribed(current, { kind: snap.kind, hash: snap.hash ?? null }))
      continue;
    if (!recordedWriteMatches(writeMap[rel], current)) {
      console.warn(
        `warning: ${rel} changed during the run and was left in place`,
      );
      continue;
    }
    const liveStage = stagedRecord(rel);
    const snapIndex =
      typeof snap.indexHash === 'string' ? snap.indexHash : null;
    const snapStaged = snap.staged === true;
    if (liveStage.indexHash !== snapIndex || liveStage.staged !== snapStaged) {
      console.warn(
        `warning: ${rel} staged state changed during the run and was left in place`,
      );
      continue;
    }
    const dest = backupRel(rel);
    if (dest) console.log(`backed up ${rel} to ${dest}`);
    if (!placeSnapshot(rel, snap)) {
      console.warn(
        `warning: ${rel} changed during the run and was left in place`,
      );
      continue;
    }
    restored.push(rel);
    console.log(`restored ${rel} to launch snapshot`);
  }
  return { restored };
}

export function beginLaunch(doctorStatus) {
  if (doctorStatus === 'READY') return 'reuse';
  if (launchOpen) return 'snapshot';
  restoreUnfinishedRun();
  restoreOwnedWrites();
  snapshotWatchedFiles();
  launchOpen = true;
  return 'snapshot';
}

export function restoreOwnedWrites() {
  try {
    return restoreOwnedWritesInner();
  } finally {
    endRestoreBackup();
  }
}

function restoreOwnedWritesInner() {
  const manifest = readManifest();
  if (!manifest) return { restored: [], warned: [], backups: [] };
  const files = manifest.files;
  const writes = readJson(writesPath(), {});
  const writeMap =
    writes && typeof writes === 'object' && !Array.isArray(writes)
      ? writes
      : {};
  const rels = new Set([...Object.keys(files), ...Object.keys(writeMap)]);
  const restored = [];
  const warned = [];
  const backups = [];
  for (const rel of rels) {
    if (!safeRel(rel)) continue;
    const snap = files[rel] ?? absentRecord();
    const current = describeWorktree(rel);
    if (handMaintained.has(rel)) {
      if (
        !sameDescribed(current, { kind: snap.kind, hash: snap.hash ?? null })
      ) {
        warned.push(rel);
        console.warn(
          `warning: ${rel} changed during the run and was left in place`,
        );
      }
      continue;
    }
    const liveStage = stagedRecord(rel);
    const snapIndex =
      typeof snap.indexHash === 'string' ? snap.indexHash : null;
    const snapStaged = snap.staged === true;
    if (liveStage.indexHash !== snapIndex || liveStage.staged !== snapStaged) {
      warned.push(rel);
      console.warn(
        `warning: ${rel} staged state changed during the run and was left in place`,
      );
      continue;
    }
    if (sameDescribed(current, { kind: snap.kind, hash: snap.hash ?? null }))
      continue;
    if (!recordedWriteMatches(writeMap[rel], current)) {
      warned.push(rel);
      console.warn(
        `warning: ${rel} changed during the run and was left in place`,
      );
      continue;
    }
    const dest = backupRel(rel);
    if (dest) {
      backups.push({ rel, dest });
      console.log(`backed up ${rel} to ${dest}`);
    }
    if (!placeSnapshot(rel, snap)) {
      warned.push(rel);
      console.warn(
        `warning: ${rel} changed during the run and was left in place`,
      );
      continue;
    }
    restored.push(rel);
    console.log(`restored ${rel} to launch snapshot`);
  }
  return { restored, warned, backups };
}
