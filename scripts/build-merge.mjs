/**
 * scripts/build-merge.mjs
 * Merge ingest fragments into per-id merged JSON without modifying authored MDX.
 *
 * Strategy:
 * - Identify authored ids from src/content/terms/*.mdx (file name = id).
 * - For each id, look for data/ingest/nist/{id}.json (and other fragment sources in future).
 * - Merge fields conservatively:
 *   - sources: union by (citation,url)
 *   - mappings: union arrays (attack.techniqueIds, cweIds, capecIds, examDomains)
 *   - updatedAt: newest ISO among fragments (fallback to now)
 * - Write data/merged/{id}.json for review/apply step.
 *
 * This is a scaffold to keep the authored summaries/examples intact.
 */

import { readdir, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, extname, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TERMS_DIR = join(__dirname, '..', 'src', 'content', 'terms');
const INGEST_NIST_DIR = join(__dirname, '..', 'data', 'ingest', 'nist');
const MERGED_DIR = join(__dirname, '..', 'data', 'merged');

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function listAuthoredIds() {
  const entries = await readdir(TERMS_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && extname(e.name).toLowerCase() === '.mdx')
    .map((e) => basename(e.name, '.mdx'));
}

async function readJson(p) {
  const raw = await readFile(p, 'utf8');
  return JSON.parse(raw);
}

function unionSources(a = [], b = []) {
  const key = (s) => `${(s.citation || '').trim()}::${(s.url || '').trim()}`;
  const map = new Map();
  for (const s of a) if (s && (s.citation || s.url)) map.set(key(s), s);
  for (const s of b) if (s && (s.citation || s.url)) map.set(key(s), { ...map.get(key(s)), ...s });
  const arr = Array.from(map.values());
  arr.sort((s1, s2) => {
    const c1 = String(s1.citation || '').toLowerCase();
    const c2 = String(s2.citation || '').toLowerCase();
    if (c1 !== c2) return c1 < c2 ? -1 : 1;
    const u1 = String(s1.url || '').toLowerCase();
    const u2 = String(s2.url || '').toLowerCase();
    return u1 < u2 ? -1 : u1 > u2 ? 1 : 0;
  });
  return arr;
}

function unionArr(a = [], b = []) {
  return Array.from(new Set([...(a || []), ...(b || [])]));
}

function mergeMappings(a = {}, b = {}) {
  const out = {};
  const attackA = a.attack || {};
  const attackB = b.attack || {};
  const attack = {};
  attack.tactic = attackB.tactic || attackA.tactic || undefined;
  attack.techniqueIds = unionArr(attackA.techniqueIds, attackB.techniqueIds);
  if (attack.techniqueIds && attack.techniqueIds.length) attack.techniqueIds.sort();
  const cweIds = unionArr(a.cweIds, b.cweIds);
  if (cweIds && cweIds.length) cweIds.sort();
  const capecIds = unionArr(a.capecIds, b.capecIds);
  if (capecIds && capecIds.length) capecIds.sort();
  const examDomains = unionArr(a.examDomains, b.examDomains);
  if (examDomains && examDomains.length) examDomains.sort();
  const hasAttack = attack.tactic || (attack.techniqueIds && attack.techniqueIds.length);
  if (hasAttack) out.attack = attack;
  if (cweIds.length) out.cweIds = cweIds;
  if (capecIds.length) out.capecIds = capecIds;
  if (examDomains.length) out.examDomains = examDomains;
  return out;
}

function newestIso(...dates) {
  const ts = dates.map((d) => (d ? Date.parse(d) : NaN)).filter((n) => Number.isFinite(n));
  if (!ts.length) return new Date().toISOString();
  return new Date(Math.max(...ts)).toISOString();
}

async function mergeForId(id) {
  const fragments = [];

  // NIST fragment
  const nistPath = join(INGEST_NIST_DIR, `${id}.json`);
  if (await exists(nistPath)) {
    try {
      fragments.push(await readJson(nistPath));
    } catch (e) {
      console.warn(`[merge] Failed to parse NIST fragment for ${id}: ${e.message}`);
    }
  }

  if (!fragments.length) return null;

  // Start with an empty container that mirrors TermEntry fields we will merge
  let merged = {
    id,
    sources: [],
    mappings: undefined,
    updatedAt: new Date().toISOString(),
  };

  for (const frag of fragments) {
    if (frag.sources) merged.sources = unionSources(merged.sources, frag.sources);
    if (frag.mappings) merged.mappings = mergeMappings(merged.mappings || {}, frag.mappings || {});
    merged.updatedAt = newestIso(merged.updatedAt, frag.updatedAt);
  }

  // Clean undefined
  if (merged.mappings && Object.keys(merged.mappings).length === 0) {
    delete merged.mappings;
  }
  return merged;
}

async function main() {
  await mkdir(MERGED_DIR, { recursive: true });
  const ids = await listAuthoredIds();
  let wrote = 0;
  for (const id of ids) {
    const merged = await mergeForId(id);
    if (!merged) continue;
    const outPath = join(MERGED_DIR, `${id}.json`);
    await writeFile(outPath, JSON.stringify(merged, null, 2), 'utf8');
    wrote++;
  }
  console.log(`[merge] Wrote ${wrote} merged file(s) to ${MERGED_DIR}`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
