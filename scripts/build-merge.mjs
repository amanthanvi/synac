/**
 * scripts/build-merge.mjs
 * Build merged catalogs and preserve per-id review files.
 *
 * New:
 * - Reads normalized raw datasets (NIST, CWE, CAPEC) and ATT&CK ingest/meta
 * - Writes data/build/merged.json with deterministic ordering and meta
 * - Tolerates missing sources
 *
 * Preserved:
 * - Continues writing review-only per-id merged files to data/merged/{id}.json
 *   using previous NIST fragment merge behavior
 */

import { readdir, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, extname, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Authored content and legacy outputs
const TERMS_DIR = join(__dirname, '..', 'src', 'content', 'terms');
const INGEST_NIST_DIR = join(__dirname, '..', 'data', 'ingest', 'nist');
const MERGED_DIR = join(__dirname, '..', 'data', 'merged');
const NIST_ALL_FILE = join(__dirname, '..', 'data', 'nist', 'glossary.json');

// New build + normalized raw paths
const BUILD_DIR = join(__dirname, '..', 'data', 'build');
const BUILD_MERGED = join(BUILD_DIR, 'merged.json');

const RAW_BASE = join(__dirname, '..', 'data', 'raw');
const RAW_NIST = join(RAW_BASE, 'nist', 'glossary.json');
const RAW_NIST_META = join(RAW_BASE, 'nist', 'meta.json');
const RAW_CWE = join(RAW_BASE, 'cwe', 'cwec.json');
const RAW_CWE_META = join(RAW_BASE, 'cwe', 'meta.json');
const RAW_CAPEC = join(RAW_BASE, 'capec', 'capec.json');
const RAW_CAPEC_META = join(RAW_BASE, 'capec', 'meta.json');
const RAW_ATTACK_META = join(RAW_BASE, 'attack', 'meta.json');

const INGEST_ATTACK = join(__dirname, '..', 'data', 'ingest', 'attack.json');

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function readJson(p) {
  const raw = await readFile(p, 'utf8');
  return JSON.parse(raw);
}

async function listAuthoredIds() {
  const entries = await readdir(TERMS_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && extname(e.name).toLowerCase() === '.mdx')
    .map((e) => basename(e.name, '.mdx'));
}

// Load consolidated NIST (legacy) for fallback to fragments
async function loadNistAll() {
  if (!(await exists(NIST_ALL_FILE))) return [];
  try {
    const payload = await readJson(NIST_ALL_FILE);
    return Array.isArray(payload?.entries)
      ? payload.entries
      : Array.isArray(payload)
        ? payload
        : [];
  } catch {
    return [];
  }
}

function unionArr(a = [], b = []) {
  return Array.from(new Set([...(a || []), ...(b || [])]));
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

/**
 * Preserve prior per-id merge behavior for authored ids
 * - NIST fragment if present: data/ingest/nist/{id}.json
 * - Else fallback to consolidated NIST glossary: data/nist/glossary.json (entries[])
 */
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
  if (!fragments.length) {
    const all = await loadNistAll();
    const hit = all.find((e) => e?.id === id);
    if (hit) {
      fragments.push(hit);
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

async function buildPerIdMerged() {
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
  return wrote;
}

/**
 * Build data/build/merged.json
 * Structure:
 * {
 *   meta: {
 *     sources: {
 *       nist: { version?, retrievedAt?, count },
 *       cwe:  { version?, retrievedAt?, count },
 *       capec:{ version?, retrievedAt?, count },
 *       attack:{ retrievedAt?, techniques, tactics }
 *     }
 *   },
 *   data: { nist: [...], cwe: [...], capec: [...], attack: {...} }
 * }
 */
async function buildUnifiedCatalog() {
  await mkdir(BUILD_DIR, { recursive: true });

  // Load sources tolerantly
  let nist = [];
  let nistMeta = {};
  let cwe = [];
  let cweMeta = {};
  let capec = [];
  let capecMeta = {};
  let attack = null;
  let attackMeta = {};

  // NIST
  try {
    if (await exists(RAW_NIST)) nist = await readJson(RAW_NIST);
    if (await exists(RAW_NIST_META)) nistMeta = await readJson(RAW_NIST_META);
  } catch (e) {
    console.warn(`[merge] NIST load failed: ${e.message}`);
  }

  // CWE
  try {
    if (await exists(RAW_CWE)) cwe = await readJson(RAW_CWE);
    if (await exists(RAW_CWE_META)) cweMeta = await readJson(RAW_CWE_META);
  } catch (e) {
    console.warn(`[merge] CWE load failed: ${e.message}`);
  }

  // CAPEC
  try {
    if (await exists(RAW_CAPEC)) capec = await readJson(RAW_CAPEC);
    if (await exists(RAW_CAPEC_META)) capecMeta = await readJson(RAW_CAPEC_META);
  } catch (e) {
    console.warn(`[merge] CAPEC load failed: ${e.message}`);
  }

  // ATT&CK
  try {
    if (await exists(INGEST_ATTACK)) attack = await readJson(INGEST_ATTACK);
    if (await exists(RAW_ATTACK_META)) attackMeta = await readJson(RAW_ATTACK_META);
  } catch (e) {
    console.warn(`[merge] ATT&CK load failed: ${e.message}`);
  }

  // Deterministic ordering
  if (Array.isArray(nist))
    nist.sort((a, b) =>
      (a?.id || '') < (b?.id || '') ? -1 : (a?.id || '') > (b?.id || '') ? 1 : 0,
    );
  if (Array.isArray(cwe)) cwe.sort((a, b) => (a?.id || 0) - (b?.id || 0));
  if (Array.isArray(capec)) capec.sort((a, b) => (a?.id || 0) - (b?.id || 0));

  const unified = {
    meta: {
      sources: {
        nist: {
          version: nistMeta?.version,
          retrievedAt: nistMeta?.retrievedAt,
          count: Array.isArray(nist) ? nist.length : 0,
        },
        cwe: {
          version: cweMeta?.version,
          retrievedAt: cweMeta?.retrievedAt,
          count: Array.isArray(cwe) ? cwe.length : 0,
        },
        capec: {
          version: capecMeta?.version,
          retrievedAt: capecMeta?.retrievedAt,
          count: Array.isArray(capec) ? capec.length : 0,
        },
        attack: {
          retrievedAt: attackMeta?.retrievedAt,
          techniques:
            attackMeta?.techniques ??
            (Array.isArray(attack?.techniques) ? attack.techniques.length : 0),
          tactics:
            attackMeta?.tactics ?? (Array.isArray(attack?.tactics) ? attack.tactics.length : 0),
        },
      },
    },
    data: {
      nist: Array.isArray(nist) ? nist : [],
      cwe: Array.isArray(cwe) ? cwe : [],
      capec: Array.isArray(capec) ? capec : [],
      attack: attack || null,
    },
  };

  await writeFile(BUILD_MERGED, JSON.stringify(unified, null, 2), 'utf8');
  console.log(`[merge] Unified catalog → ${BUILD_MERGED}`);
  return unified;
}

async function main() {
  // 1) Per-id review JSONs (legacy behavior)
  await buildPerIdMerged();

  // 2) Unified merged.json for UI
  await buildUnifiedCatalog();
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
