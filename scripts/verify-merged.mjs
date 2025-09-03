/**
 * scripts/verify-merged.mjs
 * Verify merged payload shape, counts, provenance, and determinism.
 * Node ESM, no external deps.
 */
import { readFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

import {
  stableSortObject,
  cloneDeep,
  findArraysInSection,
  pickPrimaryArray,
  comparatorForItems,
  isSorted,
  normalizeForHash,
  deriveCounts,
  checkMeta,
  prettySummary,
} from './_verify_utils.mjs';
import { sha256 } from './_cache.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const MERGED_PATH = join(ROOT, 'data', 'build', 'merged.json');

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function loadMerged() {
  if (!(await exists(MERGED_PATH))) {
    throw new Error(`Missing file: ${MERGED_PATH}. Run "npm run etl:merge" first.`);
  }
  let text;
  try {
    text = await readFile(MERGED_PATH, 'utf8');
  } catch (e) {
    throw new Error(`Failed reading ${MERGED_PATH}: ${e.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid JSON in ${MERGED_PATH}: ${e.message}`);
  }
}

async function main() {
  const violations = [];
  const warnings = [];
  let merged;
  try {
    merged = await loadMerged();
  } catch (e) {
    console.log(`violation: ${e.message}`);
    process.exit(1);
  }

  try {
    assert.ok(merged && typeof merged === 'object', 'merged payload must be an object');
    assert.ok(merged.data && typeof merged.data === 'object', 'merged.data must be an object');
  } catch (e) {
    violations.push(e.message);
  }

  const data = merged?.data && typeof merged.data === 'object' ? merged.data : {};
  const sectionKeys = Object.keys(data);
  if (sectionKeys.length === 0) {
    violations.push('No sections found under merged.data');
  }

  for (const key of sectionKeys) {
    const val = data[key];
    const arrays = findArraysInSection(val);
    if (!arrays.length) {
      violations.push(`Section "${key}" does not contain an items/entries-like array`);
      continue;
    }
    const primary = pickPrimaryArray(arrays);
    const n = primary?.arr?.length ?? 0;
    if (!(n > 0)) {
      violations.push(`Section "${key}" has empty items array`);
    }
    // Sorting checks for determinism
    for (const a of arrays) {
      const cmp = comparatorForItems(a.arr);
      if (!isSorted(a.arr, cmp)) {
        warnings.push(`warn: ${key}${a.key ? '.' + a.key : ''} not sorted`);
      }
    }
  }

  for (const m of checkMeta(merged)) violations.push(m);

  const forHash = normalizeForHash(merged, warnings);
  const stable = stableSortObject(forHash);
  const contentHash = sha256(JSON.stringify(stable));
  const counts = deriveCounts(merged);

  // Output
  if (warnings.length) {
    for (const w of warnings) console.log(w);
  }
  const summary = prettySummary(counts, contentHash);
  console.log(summary);

  if (violations.length) {
    for (const v of violations) console.log(`violation: ${v}`);
    process.exit(1);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((e) => {
    console.log(`violation: ${e?.message || String(e)}`);
    process.exit(1);
  });
}
