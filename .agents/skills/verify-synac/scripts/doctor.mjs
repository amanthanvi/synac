#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { baseUrl, portOwner, webPort } from './runtime.mjs';

const help = `Usage: node .agents/skills/verify-synac/scripts/doctor.mjs [--json] [--base-url URL]

Read-only check that the local SynAc site is worth driving.

READY (exit 0) requires all of the following:
  GET /api/healthz is 200 and {"ok":true}
  GET / is 200 and the HTML contains the glossary search landmark
  GET /api/v1/search?q=soc is 200 and meta.total is greater than 0

Anything else prints NOT_READY and exits 2.
Each request aborts after 5 seconds. That result is code timeout.
`;

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

function isTimeout(error) {
  if (!error || typeof error !== 'object') return false;
  if ('name' in error && error.name === 'TimeoutError') return true;
  if (
    'cause' in error &&
    error.cause &&
    typeof error.cause === 'object' &&
    'name' in error.cause &&
    error.cause.name === 'TimeoutError'
  ) {
    return true;
  }
  return false;
}

function fetchTimed(url) {
  return fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
}

export async function runDoctor(url = baseUrl) {
  const report = {
    status: 'NOT_READY',
    code: 'unreachable',
    baseUrl: url,
    portOwner: portOwner(webPort),
    healthz: null,
    home: null,
    search: null,
  };

  let health;
  let home;
  let search;
  try {
    health = await fetchTimed(`${url}/api/healthz`);
    home = await fetchTimed(`${url}/`);
    search = await fetchTimed(`${url}/api/v1/search?q=soc`);
  } catch (error) {
    if (isTimeout(error)) report.code = 'timeout';
    report.detail = error instanceof Error ? error.message : String(error);
    return report;
  }

  let healthText;
  let homeText;
  let searchText;
  try {
    healthText = await health.text();
    homeText = await home.text();
    searchText = await search.text();
  } catch (error) {
    report.code = 'unreachable';
    report.detail = error instanceof Error ? error.message : String(error);
    return report;
  }
  let healthBody = null;
  try {
    healthBody = JSON.parse(healthText);
  } catch {
    healthBody = null;
  }
  let searchBody = null;
  try {
    searchBody = JSON.parse(searchText);
  } catch {
    searchBody = null;
  }

  const total =
    searchBody &&
    typeof searchBody === 'object' &&
    searchBody.meta &&
    typeof searchBody.meta.total === 'number'
      ? searchBody.meta.total
      : null;

  report.healthz = { status: health.status, ok: healthBody?.ok === true };
  report.home = {
    status: home.status,
    hasSearch: homeText.includes('Glossary search'),
  };
  report.search = { status: search.status, total };

  if (health.status !== 200 || healthBody?.ok !== true) {
    report.code = 'empty-dataset';
    return report;
  }
  if (home.status !== 200 || !homeText.includes('Glossary search')) {
    report.code = 'home-unhealthy';
    return report;
  }
  if (!searchBody || search.status !== 200) {
    report.code = 'search-unreadable';
    return report;
  }
  if (total === 0) {
    report.code = 'search-empty';
    return report;
  }
  if (typeof total !== 'number') {
    report.code = 'search-unreadable';
    return report;
  }

  report.status = 'READY';
  report.code = 'ready';
  return report;
}

function printHuman(report) {
  console.log(`${report.status} ${report.code}`);
  console.log(`base ${report.baseUrl}`);
  console.log(`port ${webPort} owner: ${report.portOwner}`);
  if (report.detail) console.log(`detail ${report.detail}`);
  if (report.healthz) {
    console.log(`healthz ${report.healthz.status} ok=${report.healthz.ok}`);
  }
  if (report.home) {
    console.log(
      `home ${report.home.status} glossary-search=${report.home.hasSearch}`,
    );
  }
  if (report.search) {
    console.log(
      `search ${report.search.status} total=${report.search.total ?? 'none'}`,
    );
  }
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stdout.write(help);
    return;
  }
  const url = argValue('--base-url') ?? baseUrl;
  const report = await runDoctor(url);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }
  process.exit(report.status === 'READY' ? 0 : 2);
}

function sameFile(left, right) {
  try {
    return realpathSync(left) === realpathSync(right);
  } catch {
    return false;
  }
}

const invoked =
  process.argv[1] !== undefined &&
  sameFile(process.argv[1], fileURLToPath(import.meta.url));
if (invoked) await main();
