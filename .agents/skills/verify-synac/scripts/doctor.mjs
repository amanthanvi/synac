#!/usr/bin/env node
import { baseUrl, portOwner, webPort } from './runtime.mjs';

const help = `Usage: node .agents/skills/verify-synac/scripts/doctor.mjs [--json] [--base-url URL]

Read-only check that the local SynAc site is worth driving.

READY (exit 0) requires all of the following:
  GET /api/healthz is 200 and {"ok":true}
  GET / is 200 and the HTML contains the glossary search landmark
  GET /api/v1/search?q=soc is 200 and meta.total is greater than 0

Anything else prints NOT_READY and exits 2.
`;

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  return process.argv[index + 1];
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
    health = await fetch(`${url}/api/healthz`, { redirect: 'manual' });
    home = await fetch(`${url}/`, { redirect: 'manual' });
    search = await fetch(`${url}/api/v1/search?q=soc`, { redirect: 'manual' });
  } catch (error) {
    report.detail = error instanceof Error ? error.message : String(error);
    return report;
  }

  const healthText = await health.text();
  const homeText = await home.text();
  let healthBody = null;
  try {
    healthBody = JSON.parse(healthText);
  } catch {
    healthBody = null;
  }
  let searchBody = null;
  try {
    searchBody = JSON.parse(await search.text());
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

  if (health.status === 503 || healthBody?.ok === false) {
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
    console.log(`home ${report.home.status} glossary-search=${report.home.hasSearch}`);
  }
  if (report.search) {
    console.log(`search ${report.search.status} total=${report.search.total ?? 'none'}`);
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

const invoked =
  process.argv[1] &&
  (process.argv[1].endsWith('/doctor.mjs') || process.argv[1].endsWith('doctor.mjs'));
if (invoked) await main();
