/**
 * scripts/verify-merged.mjs
 * Verify merged payload shape, counts, provenance, and determinism.
 * Node ESM, no external deps.
 */
import { readFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

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

function sha256(s) {
  return createHash('sha256').update(s).digest('hex');
}

function stableSortObject(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(stableSortObject);
  const out = {};
  for (const k of Object.keys(v).sort()) {
    out[k] = stableSortObject(v[k]);
  }
  return out;
}

function cloneDeep(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}

function findArraysInSection(val) {
  const out = [];
  if (Array.isArray(val)) {
    out.push({ key: null, arr: val });
  } else if (val && typeof val === 'object') {
    const preferred = ['items', 'entries', 'list', 'values', 'data', 'techniques', 'tactics'];
    for (const k of preferred) {
      if (Array.isArray(val[k])) out.push({ key: k, arr: val[k] });
    }
    for (const [k, v] of Object.entries(val)) {
      if (Array.isArray(v) && !out.find((e) => e.key === k)) out.push({ key: k, arr: v });
    }
  }
  return out;
}

function pickPrimaryArray(arrays) {
  if (!arrays.length) return null;
  const copy = arrays.slice().sort((a, b) => (b.arr?.length || 0) - (a.arr?.length || 0));
  return copy[0];
}

function comparatorForItems(items) {
  const sample = items.find((it) => it && typeof it === 'object') ?? items[0];
  let key = null;
  if (sample && typeof sample === 'object') {
    if ('id' in sample) key = 'id';
    else if ('title' in sample) key = 'title';
    else if ('name' in sample) key = 'name';
  }
  return (a, b) => {
    const va = key ? a?.[key] : a;
    const vb = key ? b?.[key] : b;
    if (typeof va === 'number' && typeof vb === 'number') return va - vb;
    // numeric-ish strings
    const pa = typeof va === 'string' && /^\d+$/.test(va) ? parseInt(va, 10) : NaN;
    const pb = typeof vb === 'string' && /^\d+$/.test(vb) ? parseInt(vb, 10) : NaN;
    if (Number.isFinite(pa) && Number.isFinite(pb)) return pa - pb;
    return String(va).localeCompare(String(vb));
  };
}

function isSorted(arr, cmp) {
  for (let i = 1; i < arr.length; i++) {
    if (cmp(arr[i - 1], arr[i]) > 0) return false;
  }
  return true;
}

function normalizeForHash(merged, warnings) {
  const copy = cloneDeep(merged);
  const data = copy?.data;
  if (!data || typeof data !== 'object') return copy;
  for (const [secKey, secVal] of Object.entries(data)) {
    const arrays = findArraysInSection(secVal);
    for (const a of arrays) {
      const cmp = comparatorForItems(a.arr);
      if (!isSorted(a.arr, cmp)) {
        const sorted = a.arr.slice().sort(cmp);
        if (Array.isArray(secVal)) {
          copy.data[secKey] = sorted;
        } else if (a.key != null) {
          copy.data[secKey][a.key] = sorted;
        }
        warnings.push(
          `warn: ${secKey}${a.key ? '.' + a.key : ''} not sorted; used sorted order for hash`,
        );
      }
    }
  }
  return copy;
}

function deriveCounts(merged) {
  const sections = [];
  const data = merged?.data && typeof merged.data === 'object' ? merged.data : {};
  let overall = 0;
  for (const [key, val] of Object.entries(data)) {
    const arrays = findArraysInSection(val);
    const primary = pickPrimaryArray(arrays);
    const primaryCount = primary?.arr?.length ?? (Array.isArray(val) ? val.length : 0) ?? 0;
    overall += primaryCount;
    const details = arrays
      .filter((a) => a.key)
      .map((a) => `${a.key}=${a.arr.length}`)
      .join(', ');
    sections.push({ key, count: primaryCount, details });
  }
  return { sections, overall };
}

function checkMeta(merged) {
  const vio = [];
  const sources = merged?.meta?.sources;
  const dataKeys = Object.keys(merged?.data || {});
  if (!sources || typeof sources !== 'object') {
    vio.push('meta.sources is missing or not an object');
    return vio;
  }
  for (const k of dataKeys) {
    const m = sources[k];
    if (!m || typeof m !== 'object') {
      vio.push(`meta.sources.${k} missing`);
      continue;
    }
    const hasAny =
      m.version != null ||
      m.retrievedAt != null ||
      Number.isFinite(m.count) ||
      Number.isFinite(m.techniques) ||
      Number.isFinite(m.tactics) ||
      m.sha256 != null ||
      m.url != null ||
      m.sourceUrl != null;
    if (!hasAny) vio.push(`meta.sources.${k} lacks provenance fields`);
  }
  return vio;
}

function prettySummary({ sections, overall }, contentHash) {
  const parts = sections.map((s) =>
    s.details ? `${s.key}: ${s.count} (${s.details})` : `${s.key}: ${s.count}`,
  );
  return [
    `Counts → ${parts.join(' | ')}`,
    `Total → ${overall}`,
    `Content SHA-256 → ${contentHash}`,
  ].join('\n');
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
