#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { runDoctor } from './doctor.mjs';
import {
  baseUrl,
  convexPort,
  convexSitePort,
  convexUrl,
  assertSnapshotCheckout,
  beginLaunch,
  captureToolWrites,
  checkoutMatchesRun,
  markStepBaseline,
  ensureState,
  evidenceDir,
  finishLaunchSnapshot,
  nodeMajor,
  noteSession,
  ownsRecordedListener,
  portOpen,
  portOwner,
  readRun,
  recordCheckoutRevision,
  rememberListener,
  root,
  runLogged,
  sessionAlive,
  sessionConvex,
  sessionWeb,
  shQuote,
  startSession,
  stateDir,
  stopRecordedPid,
  tmux,
  waitFor,
  webPort,
} from './runtime.mjs';

const help = `Usage: node .agents/skills/verify-synac/scripts/launch.mjs

Starts the local SynAc stack in tmux sessions ${sessionConvex} and
${sessionWeb}, syncs repo content, and waits until doctor is READY.
State for this checkout is ${stateDir}.

Env:
  VERIFY_WEB_MODE=start|dev     start is a production build (default)
  VERIFY_SKIP_BUILD=1           reuse apps/web/.next when present
  VERIFY_SKIP_BROWSER_INSTALL=1 skip Playwright Chromium install
  VERIFY_SKIP_INSTALL=1         skip pnpm install
`;

const webEnv = {
  NEXT_PUBLIC_CONVEX_URL: convexUrl,
  NEXT_PUBLIC_SITE_URL: baseUrl,
  SYNAC_CONVEX_SERVICE_KEY: 'local-dev',
  SYNAC_RATE_LIMIT_SALT: 'local-dev',
  E2E_BASE_URL: baseUrl,
};

function fail(message) {
  const error = new Error(message);
  error.exitCode = 2;
  throw error;
}

function exportPrefix() {
  const pathEnv = process.env.PATH ?? '';
  const pairs = { PATH: pathEnv, ...webEnv };
  return Object.entries(pairs)
    .map(([key, value]) => `export ${key}=${shQuote(value)};`)
    .join(' ');
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stdout.write(help);
    return;
  }
  try {
    await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    const exitCode =
      error instanceof Error && 'exitCode' in error && error.exitCode === 2
        ? 2
        : 1;
    process.exitCode = exitCode;
  } finally {
    try {
      finishLaunchSnapshot();
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      if (!process.exitCode) process.exitCode = 1;
    }
  }
}

async function captureAfter(tool, fn) {
  markStepBaseline();
  try {
    return await fn();
  } finally {
    try {
      captureToolWrites(tool);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    }
  }
}

function ownedOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

async function releaseOwned(session, pidKeys, ports) {
  if (sessionAlive(session)) {
    const result = tmux(['kill-session', '-t', session], { stdio: 'inherit' });
    if (result.status !== 0)
      fail(`could not stop session ${session} to rebuild`);
  }
  const recorded = readRun();
  for (const key of pidKeys) {
    const saved = recorded.pids[key];
    if (saved) stopRecordedPid(saved);
  }
  for (const port of ports) {
    if (!(await portOpen(port))) continue;
    await waitFor(
      `port ${port} to close`,
      async () => !(await portOpen(port)),
      20_000,
    );
  }
}

async function run() {
  if (nodeMajor() < 24) {
    fail(
      `node ${process.version} is below 24. Put nvm Node 24 first on PATH, then rerun.`,
    );
  }
  const origin = ownedOrigin(baseUrl);
  if (
    origin !== 'http://127.0.0.1:3000' &&
    origin !== 'http://localhost:3000'
  ) {
    fail(
      `refusing base URL ${baseUrl}. This skill owns http://127.0.0.1:3000.`,
    );
  }

  ensureState();
  assertSnapshotCheckout();
  const doctor = await runDoctor(baseUrl);
  const recorded = readRun();
  const webOwned = ownsRecordedListener(sessionWeb, recorded.pids.web, webPort);
  const convexOwned = ownsRecordedListener(
    sessionConvex,
    recorded.pids.convex,
    convexPort,
  );
  const siteOwned = ownsRecordedListener(
    sessionConvex,
    recorded.pids.convexSite,
    convexSitePort,
  );
  let webUp = await portOpen(webPort);
  let convexUp = await portOpen(convexPort);
  const siteUp = await portOpen(convexSitePort);
  const revisionOk =
    webOwned || convexOwned || siteOwned ? checkoutMatchesRun(recorded) : true;
  if (
    doctor.status === 'READY' &&
    webOwned &&
    revisionOk &&
    (!siteUp || siteOwned)
  ) {
    const phase = beginLaunch('READY');
    if (phase === 'reuse') {
      console.log('REUSED');
      console.log(`evidence ${evidenceDir}`);
      return;
    }
  }

  if (webUp && !webOwned) {
    const whose = sessionAlive(sessionWeb)
      ? 'the listener pid does not match the pid recorded for this checkout'
      : 'this skill did not start it';
    fail(
      `port ${webPort} is open (${doctor.portOwner}) and ${whose}. Leave it alone.`,
    );
  }
  if (convexUp && !convexOwned) {
    const whose = sessionAlive(sessionConvex)
      ? 'the listener pid does not match the pid recorded for this checkout'
      : 'this skill did not start it';
    fail(
      `port ${convexPort} is open (${portOwner(convexPort)}) and ${whose}. Leave it alone.`,
    );
  }
  if (siteUp && !siteOwned) {
    const whose = sessionAlive(sessionConvex)
      ? 'the listener pid does not match the pid recorded for this checkout'
      : 'this skill did not start it';
    fail(
      `port ${convexSitePort} is open (${portOwner(convexSitePort)}) and ${whose}. Leave it alone.`,
    );
  }
  if (!revisionOk) {
    if (webOwned) {
      await releaseOwned(sessionWeb, ['web'], [webPort]);
      webUp = false;
    }
    if (convexOwned || siteOwned) {
      await releaseOwned(
        sessionConvex,
        ['convex', 'convexSite'],
        [convexPort, convexSitePort],
      );
      convexUp = false;
    }
  }

  beginLaunch('NOT_READY');

  if (webUp) {
    noteSession(sessionWeb);
    rememberListener('web', webPort);
  }
  if (convexUp) {
    noteSession(sessionConvex);
    rememberListener('convex', convexPort);
    if (await portOpen(convexSitePort))
      rememberListener('convexSite', convexSitePort);
  }

  if (
    process.env.VERIFY_SKIP_INSTALL !== '1' &&
    !existsSync(path.join(root, 'node_modules'))
  ) {
    const install = spawnSync('pnpm', ['install', '--frozen-lockfile'], {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
    });
    if (install.status !== 0) fail('pnpm install failed');
  }

  if (process.env.VERIFY_SKIP_BROWSER_INSTALL !== '1') {
    const browsers = spawnSync(
      'pnpm',
      ['--filter', '@synac/e2e', 'exec', 'playwright', 'install', 'chromium'],
      { cwd: root, stdio: 'inherit', env: process.env },
    );
    if (browsers.status !== 0) fail('playwright install chromium failed');
  }

  if (!convexUp) {
    await captureAfter('convex', async () => {
      const log = path.join(stateDir, 'synac-verify-convex.log');
      startSession(
        sessionConvex,
        `${exportPrefix()} export CONVEX_AGENT_MODE=anonymous; cd ${shQuote(root)}; npx convex dev < /dev/null > ${shQuote(log)} 2>&1`,
      );
      noteSession(sessionConvex);
      await waitFor(
        'Convex functions ready',
        async () => {
          if (!sessionAlive(sessionConvex)) {
            throw new Error(
              `convex session exited before it was ready. See ${log}`,
            );
          }
          if (await portOpen(convexPort))
            rememberListener('convex', convexPort);
          try {
            return readFileSync(log, 'utf8').includes('Convex functions ready');
          } catch {
            return false;
          }
        },
        180_000,
      );
      if (!(await portOpen(convexPort)))
        fail(`convex log went ready but port ${convexPort} is closed`);
      rememberListener('convex', convexPort);
      if (await portOpen(convexSitePort))
        rememberListener('convexSite', convexSitePort);
    });
  }

  await captureAfter('convex', async () => {
    let envSet = 1;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const result = spawnSync(
        'npx',
        ['convex', 'env', 'set', 'SYNAC_CONVEX_SERVICE_KEY', 'local-dev'],
        {
          cwd: root,
          stdio: 'inherit',
          env: { ...process.env, CONVEX_AGENT_MODE: 'anonymous' },
        },
      );
      envSet = result.status ?? 1;
      if (envSet === 0) break;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    if (envSet !== 0)
      fail('npx convex env set SYNAC_CONVEX_SERVICE_KEY failed');
  });

  const sync = runLogged(
    'pnpm',
    ['--filter', '@synac/content-tools', 'sync'],
    'cli-sync.log',
    { timeoutMs: 600_000, env: { CONVEX_AGENT_MODE: 'anonymous' } },
  );
  if (sync.status !== 0 || !sync.stdout.includes('tag convergence: verified')) {
    fail(`content sync failed. See ${sync.logPath}`);
  }
  console.log(`sync log ${sync.logPath}`);

  const mode = process.env.VERIFY_WEB_MODE === 'dev' ? 'dev' : 'start';
  const buildId = path.join(root, 'apps/web/.next/BUILD_ID');
  const skipBuild =
    mode === 'dev' ||
    (process.env.VERIFY_SKIP_BUILD === '1' && existsSync(buildId));
  if (!skipBuild) {
    await captureAfter('next', async () => {
      const build = spawnSync('pnpm', ['--filter', '@synac/web', 'build'], {
        cwd: root,
        stdio: 'inherit',
        env: { ...process.env, ...webEnv },
      });
      if (build.status !== 0) fail('web build failed');
    });
  }

  if (!(await portOpen(webPort))) {
    await captureAfter('next', async () => {
      const log = path.join(stateDir, 'synac-verify-web.log');
      const webCommand =
        mode === 'dev'
          ? 'pnpm --filter @synac/web exec next dev -H 127.0.0.1 -p 3000'
          : 'pnpm --filter @synac/web exec next start -H 127.0.0.1 -p 3000';
      startSession(
        sessionWeb,
        `${exportPrefix()} cd ${shQuote(root)}; ${webCommand} > ${shQuote(log)} 2>&1`,
      );
      noteSession(sessionWeb);
      await waitFor(
        'web port',
        async () => {
          if (await portOpen(webPort)) {
            rememberListener('web', webPort);
            return true;
          }
          if (!sessionAlive(sessionWeb)) {
            throw new Error(
              `web session exited before port ${webPort} opened. See ${log}`,
            );
          }
          return false;
        },
        120_000,
      );
      rememberListener('web', webPort);
    });
  }

  let ready = await runDoctor(baseUrl);
  const doctorDeadline = Date.now() + 60_000;
  while (ready.status !== 'READY' && Date.now() < doctorDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    ready = await runDoctor(baseUrl);
  }
  if (ready.status !== 'READY') {
    console.error(JSON.stringify(ready, null, 2));
    fail(`doctor is ${ready.code} after launch. Logs are in ${stateDir}`);
  }
  recordCheckoutRevision();
  console.log('STARTED');
  console.log(`evidence ${evidenceDir}`);
}

await main();
