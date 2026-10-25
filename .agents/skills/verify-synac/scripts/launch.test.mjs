import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import {
  existsSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const realRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const repo = `/tmp/synac-verify-launch-${process.pid}`;
const state = `/tmp/synac-verify-launch-state-${process.pid}`;
const launch = path.join(
  realRoot,
  '.agents/skills/verify-synac/scripts/launch.mjs',
);

function git(args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

rmSync(repo, { recursive: true, force: true });
rmSync(state, { recursive: true, force: true });
mkdirSync(repo, { recursive: true });
writeFileSync(path.join(repo, 'README.md'), 'launch\n');
git(['init']);
git(['config', 'user.email', 'verify@example.com']);
git(['config', 'user.name', 'verify']);
git(['add', '.']);
git(['-c', 'commit.gpgsign=false', 'commit', '-m', 'init']);

process.env.SYNAC_VERIFY_ROOT = repo;
process.env.SYNAC_VERIFY_STATE_DIR = state;
process.env.VERIFY_EVIDENCE_DIR = path.join(state, 'evidence');
process.env.E2E_BASE_URL = 'http://127.0.0.1:3000';

const {
  checkoutMatchesRun,
  checkoutRevision,
  readRun,
  recordCheckoutRevision,
  writeRun,
} = await import('./runtime.mjs');
const { warnForeignWebPort } = await import('./smoke.mjs');

function launchEnv(extra = {}) {
  return {
    ...process.env,
    SYNAC_VERIFY_ROOT: repo,
    SYNAC_VERIFY_STATE_DIR: state,
    VERIFY_EVIDENCE_DIR: path.join(state, 'evidence'),
    E2E_BASE_URL: 'http://127.0.0.1:3000',
    ...extra,
  };
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('launch test server has no port'));
        return;
      }
      resolve(address.port);
    });
  });
}

function closeServer(target) {
  return new Promise((resolve) => target.close(() => resolve()));
}

async function closedPort() {
  const holder = createServer();
  const port = await listen(holder);
  await closeServer(holder);
  return port;
}

function runLaunch(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [launch], { env });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`launch timed out\n${stdout}\n${stderr}`));
    }, 20_000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
}

describe('port 3000 ownership', { concurrency: false }, () => {
  let server = null;

  after(async () => {
    if (server) {
      const closing = server;
      server = null;
      await new Promise((resolve) => closing.close(() => resolve()));
    }
    rmSync(repo, { recursive: true, force: true });
    rmSync(state, { recursive: true, force: true });
  });

  test('a base URL that only shares the owned prefix is refused', () => {
    const result = spawnSync(process.execPath, [launch], {
      env: launchEnv({ E2E_BASE_URL: 'http://127.0.0.1:30001' }),
      encoding: 'utf8',
      timeout: 15_000,
    });
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /refusing base URL/);
    assert.doesNotMatch(result.stdout ?? '', /REUSED/);
  });

  test('a fake ready server on 3000 is refused', async () => {
    server = createServer((request, response) => {
      if (request.url === '/api/healthz') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end('{"ok":true}');
        return;
      }
      if (request.url === '/') {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end('<html>Glossary search</html>');
        return;
      }
      if (request.url?.startsWith('/api/v1/search')) {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end('{"meta":{"total":3},"results":[]}');
        return;
      }
      response.writeHead(404);
      response.end();
    });
    const port = await listen(server);
    const started = Date.now();
    const result = await runLaunch(
      launchEnv({
        SYNAC_VERIFY_WEB_PORT: String(port),
        E2E_BASE_URL: `http://127.0.0.1:${port}`,
      }),
    );
    assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
    assert.ok(
      Date.now() - started < 15_000,
      'doctor treated the ready server as a timeout',
    );
    assert.doesNotMatch(result.stdout ?? '', /REUSED/);
    assert.match(result.stderr, /Leave it alone/);
    assert.equal(existsSync(path.join(state, 'snapshot')), false);

    const warnings = [];
    const orig = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    const previousPort = process.env.SYNAC_VERIFY_WEB_PORT;
    process.env.SYNAC_VERIFY_WEB_PORT = String(port);
    try {
      warnForeignWebPort();
    } finally {
      console.warn = orig;
      if (previousPort === undefined) delete process.env.SYNAC_VERIFY_WEB_PORT;
      else process.env.SYNAC_VERIFY_WEB_PORT = previousPort;
    }
    assert.equal(
      warnings.some((line) => line.includes('not the web pid recorded')),
      true,
    );
  });

  test('checkout revision hashes tracked diffs and untracked files', () => {
    const rel = path.join(repo, 'README.md');
    const clean = checkoutRevision();
    assert.match(clean.head, /^[0-9a-f]{40}$/);
    assert.match(clean.diffHash, /^[0-9a-f]{64}$/);
    writeRun({
      ...readRun(),
      repoRoot: repo,
      head: clean.head,
      diffHash: clean.diffHash,
      sessions: [],
      pids: { convex: null, web: null, convexSite: null },
    });
    assert.equal(checkoutMatchesRun(), true);
    writeFileSync(rel, 'launch\nchanged\n');
    try {
      assert.equal(checkoutMatchesRun(), false);
    } finally {
      writeFileSync(rel, 'launch\n');
    }
    assert.equal(checkoutMatchesRun(), true);

    const extra = path.join(repo, 'notes.txt');
    const link = path.join(repo, 'link.txt');
    writeFileSync(extra, 'untracked\n');
    try {
      const withFile = checkoutRevision();
      assert.notEqual(withFile.diffHash, clean.diffHash);
      assert.equal(checkoutMatchesRun(), false);
      writeFileSync(extra, 'untracked\nchanged\n');
      assert.notEqual(checkoutRevision().diffHash, withFile.diffHash);
      rmSync(extra);
      symlinkSync('README.md', link);
      const linked = checkoutRevision();
      assert.notEqual(linked.diffHash, clean.diffHash);
      symlinkSync('missing', path.join(repo, 'other-link.txt'));
      assert.notEqual(checkoutRevision().diffHash, linked.diffHash);
    } finally {
      rmSync(extra, { force: true });
      rmSync(link, { force: true });
      rmSync(path.join(repo, 'other-link.txt'), { force: true });
    }
    assert.equal(checkoutMatchesRun(), true);

    writeFileSync(path.join(repo, '.gitignore'), 'ignored.txt\n');
    git(['add', '.gitignore']);
    git(['-c', 'commit.gpgsign=false', 'commit', '-m', 'ignore']);
    const ignoredBaseline = checkoutRevision();
    writeFileSync(path.join(repo, 'ignored.txt'), 'secret\n');
    try {
      assert.equal(checkoutRevision().diffHash, ignoredBaseline.diffHash);
    } finally {
      rmSync(path.join(repo, 'ignored.txt'), { force: true });
    }

    const recorded = recordCheckoutRevision();
    assert.equal(recorded.head, ignoredBaseline.head);
    assert.equal(readRun().head, ignoredBaseline.head);
    assert.equal(readRun().diffHash, ignoredBaseline.diffHash);
  });

  test('a listener on 3211 that this checkout does not own is refused', async () => {
    if (server) {
      const closing = server;
      server = null;
      await new Promise((resolve) => closing.close(() => resolve()));
    }
    server = createServer((_request, response) => {
      response.writeHead(200);
      response.end('site');
    });
    const sitePort = await listen(server);
    const web = await closedPort();
    const convex = await closedPort();
    const started = Date.now();
    const result = await runLaunch(
      launchEnv({
        SYNAC_VERIFY_WEB_PORT: String(web),
        SYNAC_VERIFY_CONVEX_PORT: String(convex),
        SYNAC_VERIFY_CONVEX_SITE_PORT: String(sitePort),
        E2E_BASE_URL: `http://127.0.0.1:${web}`,
      }),
    );
    assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
    assert.ok(Date.now() - started < 15_000, result.stderr);
    assert.doesNotMatch(result.stdout ?? '', /REUSED/);
    assert.match(result.stderr, new RegExp(`port ${sitePort} is open`));
    assert.match(result.stderr, /Leave it alone/);
    assert.equal(existsSync(path.join(state, 'snapshot')), false);
  });
});
