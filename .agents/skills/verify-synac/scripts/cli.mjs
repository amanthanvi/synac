#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evidenceDir, ensureState, root, runLogged, stateDir } from './runtime.mjs';

const help = `Usage: node .agents/skills/verify-synac/scripts/cli.mjs [--smoke]

Runs the content CLI and checks side effects.

--smoke   content:check and content:compile (writes tools/content/dist/compiled.json)
default   smoke, plus content:history, a hostile content dir, ingest usage,
          and an isolated rfc4949 ingest. A network-unreachable ingest is
          INCONCLUSIVE when the final thrown error and its cause are a
          network failure with no HTTP status. Indented stack frames are
          ignored. Any HTTP status, parser error, or other failure exits 1.
`;

const compiledPath = path.join(root, 'tools/content/dist/compiled.json');

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function requireOk(step, result, needle) {
  if (result.status !== 0) {
    throw new Error(`${step} exited ${result.status}. See ${result.logPath}`);
  }
  if (needle && !`${result.stdout}\n${result.stderr}`.includes(needle)) {
    throw new Error(`${step} output missing ${JSON.stringify(needle)}. See ${result.logPath}`);
  }
  return result;
}

function smokeSteps(report) {
  const check = requireOk(
    'content:check',
    runLogged('pnpm', ['content:check'], 'cli-content-check.log'),
    'content ok:',
  );
  const versionMatch = check.stdout.match(/\(version ([0-9a-f]{12})\)/);
  const version = versionMatch?.[1];
  if (!version) throw new Error('content:check did not print a content version');

  requireOk(
    'content:compile',
    runLogged('pnpm', ['content:compile'], 'cli-content-compile.log'),
    'compiled dataset written to tools/content/dist/compiled.json',
  );
  const compiled = JSON.parse(readFileSync(compiledPath, 'utf8'));
  if (typeof compiled.contentVersion !== 'string' || !compiled.contentVersion.startsWith(version)) {
    throw new Error('compiled.json contentVersion does not match content:check');
  }
  if (!Array.isArray(compiled.entries) || compiled.entries.length === 0) {
    throw new Error('compiled.json has no entries');
  }
  report.steps.push({
    name: 'content-check-and-compile',
    status: 'pass',
    version,
    entries: compiled.entries.length,
    file: compiledPath,
  });
}

function historyStep(report) {
  const result = requireOk(
    'content:history',
    runLogged('pnpm', ['content:history'], 'cli-content-history.log'),
    'tag assignment history ok:',
  );
  report.steps.push({ name: 'content-history', status: 'pass', log: result.logPath });
}

function hostileStep(report) {
  const dir = path.join(stateDir, 'hostile-content');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'tags.json'), '{');
  const bad = runLogged('pnpm', ['content:check'], 'cli-content-hostile.log', {
    env: { SYNAC_CONTENT_DIR: dir },
  });
  if (bad.status === 0) {
    throw new Error('content:check accepted a hostile content dir');
  }
  const text = `${bad.stdout}\n${bad.stderr}`;
  if (!text.includes('content check failed') && !text.includes('invalid JSON')) {
    throw new Error(`hostile content:check did not report a schema failure. See ${bad.logPath}`);
  }
  report.steps.push({ name: 'content-hostile', status: 'pass', log: bad.logPath });

  const usage = runLogged(
    'pnpm',
    ['--filter', '@synac/ingest-tools', 'ingest'],
    'cli-ingest-usage.log',
  );
  const usageText = `${usage.stdout}\n${usage.stderr}`;
  if (usage.status === 0 || !usageText.includes('usage: ingest')) {
    throw new Error(`ingest with no args did not print usage. See ${usage.logPath}`);
  }
  report.steps.push({ name: 'ingest-usage', status: 'pass', log: usage.logPath });

  const missing = runLogged(
    'pnpm',
    ['--filter', '@synac/ingest-tools', 'ingest', '--', '--source', 'not-a-source'],
    'cli-ingest-missing.log',
    { env: { SYNAC_CONTENT_DIR: dir } },
  );
  const missingText = `${missing.stdout}\n${missing.stderr}`;
  if (missing.status === 0 || !missingText.includes('no source registry file')) {
    throw new Error(`missing ingest source was not rejected. See ${missing.logPath}`);
  }
  report.steps.push({ name: 'ingest-missing-source', status: 'pass', log: missing.logPath });
}

function ingestStep(report) {
  const dir = path.join(stateDir, 'ingest-content');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(path.join(dir, 'sources'), { recursive: true });
  mkdirSync(path.join(dir, 'generated'), { recursive: true });
  const source = path.join(root, 'content/sources/rfc4949.json');
  const bundle = path.join(root, 'content/generated/rfc4949.json');
  cpSync(source, path.join(dir, 'sources/rfc4949.json'));
  cpSync(bundle, path.join(dir, 'generated/rfc4949.json'));
  const before = sha256(bundle);

  const result = runLogged(
    'pnpm',
    ['--filter', '@synac/ingest-tools', 'ingest', '--', '--source', 'rfc4949'],
    'cli-ingest-rfc4949.log',
    { env: { SYNAC_CONTENT_DIR: dir }, timeoutMs: 180_000 },
  );
  const after = sha256(bundle);
  if (before !== after) {
    throw new Error('isolated ingest modified content/generated/rfc4949.json in the repo');
  }
  const text = `${result.stdout}\n${result.stderr}`;
  const wrote = existsSync(path.join(dir, 'generated/rfc4949.json'));
  if (result.status === 0 && wrote && /rfc4949: (unchanged|updated|skipped)/.test(text)) {
    report.steps.push({
      name: 'ingest-rfc4949',
      status: 'pass',
      log: result.logPath,
      isolatedDir: dir,
    });
    return;
  }
  const detail = text.trim().split('\n').slice(-8).join(' ');
  if (ingestNetworkUnreachable(text)) {
    report.steps.push({
      name: 'ingest-rfc4949',
      status: 'INCONCLUSIVE',
      reason: `network unreachable (exit ${result.status}). ${detail}`,
      log: result.logPath,
    });
    console.log(`INCONCLUSIVE ingest rfc4949: network unreachable. See ${result.logPath}`);
    return;
  }
  throw new Error(
    `ingest rfc4949 failed (exit ${result.status}). ${detail} See ${result.logPath}`,
  );
}

const networkUnreachable =
  /ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|ECONNREFUSED|ETIMEDOUT|ECONNRESET|UND_ERR_CONNECT_TIMEOUT|UND_ERR_SOCKET|getaddrinfo|Hostname did not resolve|network is unreachable|socket hang up|TypeError: fetch failed\b|[✗✘]\s+\S+:\s+fetch failed\b/;

function isWrapperLine(line) {
  if (line.length === 0 || line === '^' || line.startsWith('\u2009')) return true;
  if (/^\$\s/.test(line) || /^>\s/.test(line)) return true;
  if (/^exit\s+\d+$/.test(line) || /^Exit status\b/.test(line)) return true;
  if (/^(?:npm|pnpm)\s/.test(line)) return true;
  if (/^\/\S+:$/.test(line)) return true;
  return false;
}

function isNamedError(line) {
  const match = /^(?:\[([A-Za-z_][\w$]*)|([A-Za-z_][\w$]*)): \S/.exec(line);
  if (!match) return false;
  const name = match[1] ?? match[2] ?? '';
  return name.endsWith('Error') || name.endsWith('Exception');
}

function isMarkedError(line) {
  return /^[✗✘]\s+\S/.test(line);
}

function isBraceOrPunctuation(line) {
  return /^[^\p{L}\p{N}]+$/u.test(line);
}

function isErrorLine(line) {
  if (line.length === 0 || /^\s/.test(line) || isWrapperLine(line) || isBraceOrPunctuation(line)) {
    return false;
  }
  if (isMarkedError(line) || isNamedError(line)) return true;
  return !/: /.test(line);
}

function isExplicitCause(line) {
  const trimmed = line.trim();
  return /^\[cause\]:/i.test(trimmed) || /^caused by:/i.test(trimmed) || /^cause:/i.test(trimmed);
}

function isStackFrame(line) {
  return /^\s+at\s/.test(line);
}

export function finalThrownError(text) {
  const lines = text.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (isErrorLine(lines[i] ?? '')) start = i;
  }
  if (start === -1) return '';
  const block = [lines[start] ?? ''];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (isExplicitCause(line)) {
      block.push(line);
      continue;
    }
    if (line.trim() === '' && isExplicitCause(lines[i + 1] ?? '')) {
      block.push(line);
      continue;
    }
    if (isStackFrame(line) || isBraceOrPunctuation(line)) continue;
    break;
  }
  return block.join('\n');
}

function hasHttpStatus(text) {
  return (
    /\bfetch failed \(\d{3}\)/i.test(text) ||
    /\bHTTP\/\d+(?:\.\d+)?\s+\d{3}\b/.test(text) ||
    /\bHTTP\s+\d{3}\b/.test(text) ||
    /\bstatus(?:\s+code)?\s*[:=]?\s*\d{3}\b/i.test(text)
  );
}

export function ingestNetworkUnreachable(text) {
  const errorText = finalThrownError(text);
  if (!errorText) return false;
  if (hasHttpStatus(errorText)) return false;
  return networkUnreachable.test(errorText);
}

function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stdout.write(help);
    return;
  }
  ensureState();
  const smoke = process.argv.includes('--smoke');
  const report = { steps: [] };
  try {
    smokeSteps(report);
    if (!smoke) {
      historyStep(report);
      hostileStep(report);
      ingestStep(report);
    }
  } catch (error) {
    report.steps.push({
      name: 'failed',
      status: 'fail',
      reason: error instanceof Error ? error.message : String(error),
    });
    writeFileSync(path.join(evidenceDir, 'cli-report.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
  writeFileSync(path.join(evidenceDir, 'cli-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`cli report ${path.join(evidenceDir, 'cli-report.json')}`);
}

function sameFile(left, right) {
  try {
    return realpathSync(left) === realpathSync(right);
  } catch {
    return false;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && sameFile(process.argv[1], fileURLToPath(import.meta.url));
if (invokedDirectly) main();
