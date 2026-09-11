#!/usr/bin/env node
/**
 * Version consistency gate.
 *
 * Asserts that every workspace `package.json` version and the `version:` field
 * in `CITATION.cff` agree with the root `package.json` version.
 *
 * Usage: `node scripts/checkVersions.mjs` (also `pnpm version:check`).
 * Exits 1 on any mismatch or missing file.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

/** Workspace manifests that must share the root version. */
const MANIFESTS = [
  'package.json',
  'apps/web/package.json',
  'apps/worker/package.json',
  'apps/e2e/package.json',
  'packages/db/package.json',
  'packages/shared/package.json',
];

const CITATION = 'CITATION.cff';

/** @param {string} relPath */
function read(relPath) {
  try {
    return readFileSync(path.join(repoRoot, relPath), 'utf8');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot read ${relPath}: ${reason}`);
  }
}

/** @param {string} relPath */
function manifestVersion(relPath) {
  const parsed = JSON.parse(read(relPath));
  const version = parsed.version;
  if (typeof version !== 'string' || version.length === 0) {
    throw new Error(`${relPath} has no "version" field`);
  }
  return version;
}

/** Minimal, targeted parse: CITATION.cff is YAML but we only need one key. */
function citationVersion() {
  const match = read(CITATION).match(/^version:\s*["']?([^"'\r\n]+)["']?\s*$/m);
  if (!match) {
    throw new Error(`${CITATION} has no top-level "version:" key`);
  }
  return match[1].trim();
}

/** @type {string[]} */
const problems = [];
/** @type {Array<{ file: string, version: string }>} */
const found = [];

let expected = '';
try {
  expected = manifestVersion('package.json');
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

for (const relPath of MANIFESTS) {
  try {
    const version = manifestVersion(relPath);
    found.push({ file: relPath, version });
    if (version !== expected) {
      problems.push(`${relPath}: ${version} (expected ${expected})`);
    }
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }
}

try {
  const version = citationVersion();
  found.push({ file: CITATION, version });
  if (version !== expected) {
    problems.push(`${CITATION}: ${version} (expected ${expected})`);
  }
} catch (error) {
  problems.push(error instanceof Error ? error.message : String(error));
}

for (const entry of found) {
  const mark = entry.version === expected ? '✓' : '✗';
  console.log(`${mark} ${entry.file.padEnd(30)} ${entry.version}`);
}

if (problems.length > 0) {
  console.error('\nVersion mismatch:');
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  console.error(
    '\nBump every workspace package.json and CITATION.cff together, then re-run.',
  );
  process.exit(1);
}

console.log(`\nAll versions agree at ${expected}.`);
