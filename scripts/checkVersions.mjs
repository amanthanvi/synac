#!/usr/bin/env node
// Checks that one version number is used everywhere: the root package.json,
// every workspace package.json, CITATION.cff, and the newest released heading
// in CHANGELOG.md. Run it with `pnpm version:check`.
//
// This is deliberately not part of `pnpm gate`. A release bump touches files
// that several people own, so the check is a release-time report rather than
// a pull request blocker.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Workspace globs from pnpm-workspace.yaml, kept simple: one level deep. */
const workspaceRoots = ['apps', 'packages', 'tools'];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function collectPackageFiles() {
  const found = [join(repoRoot, 'package.json')];
  for (const group of workspaceRoots) {
    const groupPath = join(repoRoot, group);
    if (!isDirectory(groupPath)) continue;
    for (const name of readdirSync(groupPath).sort()) {
      const manifest = join(groupPath, name, 'package.json');
      try {
        statSync(manifest);
      } catch {
        continue;
      }
      found.push(manifest);
    }
  }
  return found;
}

function citationVersion() {
  const text = readFileSync(join(repoRoot, 'CITATION.cff'), 'utf8');
  const match = /^version:\s*"?([^"\r\n]+)"?\s*$/m.exec(text);
  return match ? match[1].trim() : null;
}

function changelogVersion() {
  const text = readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf8');
  for (const line of text.split('\n')) {
    const match = /^##\s+v(\d+\.\d+\.\d+)/.exec(line.trim());
    if (match) return match[1];
  }
  return null;
}

const packageFiles = collectPackageFiles();
const rootVersion = readJson(packageFiles[0]).version;
const problems = [];

for (const file of packageFiles) {
  const { name, version } = readJson(file);
  if (version !== rootVersion) {
    problems.push(
      `${relative(repoRoot, file)} (${name ?? 'unnamed'}) is ${version}, expected ${rootVersion}`,
    );
  }
}

const citation = citationVersion();
if (citation === null) {
  problems.push('CITATION.cff has no version field');
} else if (citation !== rootVersion) {
  problems.push(`CITATION.cff is ${citation}, expected ${rootVersion}`);
}

const changelog = changelogVersion();
if (changelog === null) {
  problems.push('CHANGELOG.md has no released "## vX.Y.Z" heading');
} else if (changelog !== rootVersion) {
  problems.push(
    `CHANGELOG.md newest release heading is v${changelog}, expected v${rootVersion}`,
  );
}

if (problems.length > 0) {
  console.error(`Version mismatch. Root package.json declares ${rootVersion}.`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('');
  console.error('Set every file above to the same version, then re-run.');
  process.exit(1);
}

console.log(`All versions agree on ${rootVersion}.`);
