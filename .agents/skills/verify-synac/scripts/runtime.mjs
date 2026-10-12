import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

export const root = path.resolve(scriptDir, '../../../..');
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
  mkdirSync(stateDir, { recursive: true });
  mkdirSync(evidenceDir, { recursive: true });
}

export function readRun() {
  try {
    const value = JSON.parse(readFileSync(runFile, 'utf8'));
    if (!value || typeof value !== 'object') return emptyRun();
    return {
      sessions: Array.isArray(value.sessions) ? value.sessions : [],
      pids: value.pids && typeof value.pids === 'object' ? value.pids : {},
      startedAt: typeof value.startedAt === 'string' ? value.startedAt : '',
      webMode: value.webMode === 'dev' ? 'dev' : 'start',
      baseUrl: typeof value.baseUrl === 'string' ? value.baseUrl : baseUrl,
    };
  } catch {
    return emptyRun();
  }
}

function emptyRun() {
  return {
    sessions: [],
    pids: {},
    startedAt: '',
    webMode: 'start',
    baseUrl,
  };
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
