/**
 * scripts/fetch-mitre.mjs
 * MITRE ETL with caching for ATT&CK, CWE, CAPEC.
 *
 * Behavior:
 * - Shared: ETL_OFFLINE, ETL_FORCE_REFRESH, ETL_CACHE_TTL_HOURS, DEBUG=etl
 * - ATT&CK:
 *   - Primary URL GitHub STIX JSON; fallback to main branch
 *   - Cache vendor JSON to data/vendor/attack/attack.json (+ .meta.json)
 *   - Normalize to data/ingest/attack.json and data/mitre/attack.json
 *   - Write data/raw/attack/meta.json with counts
 * - CWE:
 *   - Try JSON zip first (404 triggers XML fallback)
 *   - Fallback discovery: https://cwe.mitre.org/data/downloads.html, pick highest vX.Y .xml.zip
 *   - Cache artifacts under data/vendor/cwe/ (stable names for JSON zip; keep original for XML zip)
 *   - If XML used: write data/raw/cwe/_raw.xml.json
 *   - Normalize to data/raw/cwe/cwec.json (array) + data/raw/cwe/meta.json
 *   - Back-compat map: data/ingest/cwe.json { "CWE-79": "Improper ..." }
 * - CAPEC: mirror CWE behavior; outputs data/raw/capec/** and back-compat data/ingest/capec.json
 *
 * Entry guard follows scripts/build-merge.mjs pattern.
 */
import { mkdir, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { TextDecoder, TextEncoder } from 'node:util';
import { fetchJsonPinned, fetchBufferPinned } from './_http.mjs';
import {
  getDirs,
  ensureDir,
  sha256,
  nowIso,
  isFresh,
  readJson,
  writeJson,
  readBuffer,
  writeBuffer,
} from './_cache.mjs';
import { debugLog } from './_log.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Output mirrors
const OUT_DIR_INGEST = join(__dirname, '..', 'data', 'ingest');
const OUT_DIR_MITRE = join(__dirname, '..', 'data', 'mitre');

// Common flags
const OFFLINE = /^(1|true|yes)$/i.test(String(process.env.ETL_OFFLINE || ''));
const FORCE = /^(1|true|yes)$/i.test(String(process.env.ETL_FORCE_REFRESH || ''));
const TTL_HOURS = Number.parseInt(String(process.env.ETL_CACHE_TTL_HOURS || '24'), 10) || 24;
const STDOUT = /^(1|true|yes)$/i.test(String(process.env.ETL_STDOUT || ''));

// ATT&CK config
const { vendorDir: attackVendorDir, rawDir: attackRawDir } = getDirs('attack');
const MITRE_ATTACK_URL =
  process.env.MITRE_ATTACK_URL ||
  process.env.ATTACK_STIX_URL ||
  'https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/enterprise-attack/enterprise-attack.json';
const MITRE_ATTACK_URL_FALLBACKS = [
  'https://raw.githubusercontent.com/mitre-attack/attack-stix-data/main/enterprise-attack/enterprise-attack.json',
];

// CWE config
const { vendorDir: cweVendorDir, rawDir: cweRawDir } = getDirs('cwe');
const MITRE_CWE_URL = process.env.MITRE_CWE_URL || '';
const DEFAULT_CWE_URLS = ['https://cwe.mitre.org/data/json/cwec_latest.json.zip'];
const CWE_DOWNLOADS_URL = 'https://cwe.mitre.org/data/downloads.html';
const CWE_XML_ZIP_RE = /cwec.*\.xml\.zip/i;
const CWE_XML_PLAIN_RE = /cwec.*\.xml/i;

// CAPEC config
const { vendorDir: capecVendorDir, rawDir: capecRawDir } = getDirs('capec');
const MITRE_CAPEC_URL = process.env.MITRE_CAPEC_URL || '';
const DEFAULT_CAPEC_URLS = ['https://capec.mitre.org/data/json/capec_latest.json.zip'];
const CAPEC_DOWNLOADS_URL = 'https://capec.mitre.org/data/downloads.html';
const CAPEC_XML_ZIP_RE = /capec.*\.xml\.zip/i;
const CAPEC_XML_PLAIN_RE = /capec.*\.xml/i;

// Optional local files (may be .json or .zip for CWE/CAPEC JSON zips)
const MITRE_ATTACK_FILE = process.env.MITRE_ATTACK_FILE || process.env.ATTACK_STIX_FILE;
const MITRE_CWE_FILE = process.env.MITRE_CWE_FILE || process.env.CWE_JSON_FILE;
const MITRE_CAPEC_FILE = process.env.MITRE_CAPEC_FILE || process.env.CAPEC_JSON_FILE;

// -------------------- helpers --------------------
async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}
function toArray(x) {
  return Array.isArray(x) ? x : x != null ? [x] : [];
}
function is404Error(e) {
  return /HTTP\s+404/i.test(String(e?.message || ''));
}
function versionTupleFromStr(s) {
  const m = String(s || '').match(/v(\d+)(?:\.(\d+))?/i);
  if (!m) return [0, 0];
  return [parseInt(m[1] || '0', 10), parseInt(m[2] || '0', 10)];
}
function decodeJsonFromZipBuffer(buf) {
  const files = unzipSync(buf);
  for (const [name, content] of Object.entries(files)) {
    if (name.toLowerCase().endsWith('.json')) {
      const text = new TextDecoder('utf-8').decode(content);
      return JSON.parse(text);
    }
  }
  throw new Error('ZIP did not contain a .json payload');
}
function pickFirstXmlFromZip(buf) {
  const files = unzipSync(buf);
  for (const [name, content] of Object.entries(files)) {
    if (name.toLowerCase().endsWith('.xml')) {
      const text = new TextDecoder('utf-8').decode(content);
      return { xmlName: name, xmlText: text };
    }
  }
  throw new Error('ZIP did not contain a .xml payload');
}
function stripMarkupLocal(input) {
  if (input == null) return '';
  let s = String(input);
  // common entity replacements
  s = s
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/&/g, '&')
    .replace(/&nbsp;/g, ' ');
  s = s.replace(/"/g, '\\"').replace(/'/g, "\\'");
  // remove tags and collapse
  s = s
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}
function getText(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return v.map(getText).filter(Boolean).join(' ');
  // fast-xml-parser uses '#text' for text nodes
  if (typeof v === 'object') {
    if ('#text' in v) return getText(v['#text']);
    // concatenate all primitive values shallowly
    const parts = [];
    for (const k of Object.keys(v)) {
      if (k === '#text') continue;
      const t = getText(v[k]);
      if (t) parts.push(t);
    }
    return parts.join(' ');
  }
  return String(v);
}

// -------------------- ATT&CK --------------------
function normalizeAttack(stix) {
  const objs = Array.isArray(stix?.objects) ? stix.objects : [];
  const techniques = [];
  const tactics = [];
  const tacticById = new Map();

  for (const o of objs) {
    if (
      o?.type === 'x-mitre-tactic' ||
      (o?.x_mitre_deprecated === false && /tactic/i.test(o?.type || ''))
    ) {
      const tId = (o?.external_references || []).find((r) =>
        /^TA\d{4}/.test(r?.external_id || ''),
      )?.external_id;
      const name = o?.name;
      if (tId && name) {
        tacticById.set(o?.id, { id: tId, name });
        tactics.push({ id: tId, name });
      }
    }
  }

  for (const o of objs) {
    if (o?.type === 'attack-pattern') {
      const ext = (o?.external_references || []).find((r) => /^T\d{4}/.test(r?.external_id || ''));
      const tId = ext?.external_id;
      const name = o?.name;
      if (!tId || !name) continue;

      const tacts = [];
      for (const phase of o?.kill_chain_phases || []) {
        const phaseName = (phase?.phase_name || '').toLowerCase();
        const matched = [...tacticById.values()].find(
          (t) => (t.name || '').toLowerCase() === phaseName,
        );
        if (matched) tacts.push(matched.name.toLowerCase());
        else if (phaseName) tacts.push(phaseName);
      }
      techniques.push({ id: tId, name, tactics: Array.from(new Set(tacts)) });
    }
  }
  const uniqTactics = Object.values(Object.fromEntries(tactics.map((t) => [t.id, t])));
  return { techniques, tactics: uniqTactics };
}

async function fetchAttackVendorJson() {
  await ensureDir(attackVendorDir);
  const vendorJson = join(attackVendorDir, 'attack.json');
  const vendorMeta = join(attackVendorDir, 'attack.json.meta.json');

  // Local override
  if (MITRE_ATTACK_FILE) {
    debugLog('[attack] Using local file override:', MITRE_ATTACK_FILE);
    const raw = await readFile(MITRE_ATTACK_FILE, 'utf8');
    const json = JSON.parse(raw);
    const meta = {
      url: 'file://' + MITRE_ATTACK_FILE,
      retrievedAt: nowIso(),
      sha256: sha256(raw),
      fromCache: false,
    };
    return { json, meta, fromCache: false };
  }

  if (OFFLINE) {
    if (await fileExists(vendorJson)) {
      debugLog('[attack] Offline: using cached vendor JSON', vendorJson);
      const text = new TextDecoder('utf-8').decode(await readBuffer(vendorJson));
      const json = JSON.parse(text);
      const meta = (await fileExists(vendorMeta)) ? await readJson(vendorMeta) : null;
      return { json, meta, fromCache: true };
    }
    console.warn('[attack] Offline and no vendor cache found; skipping.');
    return { json: null, meta: null, fromCache: true };
  }

  if ((await isFresh(vendorMeta, TTL_HOURS, FORCE)) && (await fileExists(vendorJson))) {
    debugLog('[attack] Cache fresh; reusing', vendorJson);
    const text = new TextDecoder('utf-8').decode(await readBuffer(vendorJson));
    const json = JSON.parse(text);
    const meta = await readJson(vendorMeta);
    return { json, meta, fromCache: true };
  }

  let lastErr;
  const urls = [MITRE_ATTACK_URL, ...MITRE_ATTACK_URL_FALLBACKS].filter(Boolean);
  for (const url of urls) {
    try {
      debugLog('[attack] Fetching', url);
      const obj = await fetchJsonPinned(url, { headers: { accept: 'application/json' } });
      const text = JSON.stringify(obj);
      await writeBuffer(vendorJson, new TextEncoder().encode(text));
      const meta = { url, retrievedAt: nowIso(), sha256: sha256(text), fromCache: false };
      await writeJson(vendorMeta, meta);
      return { json: obj, meta, fromCache: false };
    } catch (e) {
      lastErr = e;
      debugLog('[attack] Failed URL', String(e?.message || e));
    }
  }
  console.error('[attack] All URLs failed.', lastErr?.message || '');
  return { json: null, meta: null, fromCache: false };
}

// -------------------- CWE/CAPEC common --------------------
async function tryJsonZipToJson(urls, vendorDir, stableNameBase, label) {
  await ensureDir(vendorDir);
  const zipPath = join(vendorDir, `${stableNameBase}.json.zip`);
  const metaPath = join(vendorDir, `${stableNameBase}.json.zip.meta.json`);

  if (OFFLINE) {
    if (await fileExists(zipPath)) {
      debugLog(`[${label}] Offline: using cached JSON zip`, zipPath);
      const buf = await readBuffer(zipPath);
      const json = decodeJsonFromZipBuffer(buf);
      const meta = (await fileExists(metaPath)) ? await readJson(metaPath) : null;
      return { json, meta, fromCache: true, shouldFallback: false };
    }
    debugLog(`[${label}] Offline: JSON zip cache missing`);
    return { json: null, meta: null, fromCache: true, shouldFallback: true };
  }

  if ((await isFresh(metaPath, TTL_HOURS, FORCE)) && (await fileExists(zipPath))) {
    debugLog(`[${label}] Cache fresh: using vendor JSON zip`, zipPath);
    const buf = await readBuffer(zipPath);
    const json = decodeJsonFromZipBuffer(buf);
    const meta = await readJson(metaPath);
    return { json, meta, fromCache: true, shouldFallback: false };
  }

  let saw404 = false;
  for (const url of urls) {
    try {
      debugLog(`[${label}] Downloading JSON zip`, url);
      const buf = await fetchBufferPinned(url, { headers: { accept: '*/*' } });
      await writeBuffer(zipPath, buf);
      const meta = { url, retrievedAt: nowIso(), sha256: sha256(buf), fromCache: false };
      await writeJson(metaPath, meta);
      const json = decodeJsonFromZipBuffer(buf);
      return { json, meta, fromCache: false, shouldFallback: false };
    } catch (e) {
      if (is404Error(e)) {
        saw404 = true;
        debugLog(`[${label}] JSON endpoint 404; will fallback to XML`);
        break;
      }
      debugLog(`[${label}] JSON zip failed: ${String(e?.message || e)}`);
    }
  }
  return { json: null, meta: null, fromCache: false, shouldFallback: true || saw404 };
}

async function discoverLatestXmlZip(htmlBuf, baseUrl, re) {
  // dynamic import to avoid requiring cheerio unless needed
  const { load } = await import('cheerio');
  const html = new TextDecoder('utf-8').decode(htmlBuf);
  const $ = load(html);
  const candidates = [];
  $('a[href]').each((_, a) => {
    const href = String($(a).attr('href') || '');
    if (re.test(href)) {
      const url = new URL(href, baseUrl).toString();
      const vt = versionTupleFromStr(href);
      candidates.push({ url, vt, href });
    }
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.vt[0] - a.vt[0] || b.vt[1] - a.vt[1]);
  return candidates[0];
}

async function loadViaXmlFallback({
  downloadsUrl,
  vendorDir,
  label,
  xmlZipNameHintRe,
  xmlPlainNameHintRe,
}) {
  await ensureDir(vendorDir);

  if (OFFLINE) {
    const files = await readdir(vendorDir).catch(() => []);
    const zipName = files.find((f) => /\.xml\.zip$/i.test(f));
    const xmlName = files.find((f) => /\.xml$/i.test(f));
    if (!zipName && !xmlName) {
      console.warn(`[${label}] Offline and no vendor XML artifacts; skipping.`);
      return {
        json: null,
        meta: null,
        fromCache: true,
        usedXml: false,
        xmlRawJson: null,
        version: undefined,
      };
    }
    let xmlText = null;
    let usedZip = false;
    if (xmlName) {
      xmlText = new TextDecoder('utf-8').decode(await readBuffer(join(vendorDir, xmlName)));
    } else if (zipName) {
      const { xmlText: t } = pickFirstXmlFromZip(await readBuffer(join(vendorDir, zipName)));
      xmlText = t;
      usedZip = true;
    }
    // dynamic import XML parser on demand
    const { parseXmlToJson } = await import('./_xml.mjs');
    const json = parseXmlToJson(xmlText);
    const metaPath = join(vendorDir, 'xml.meta.json');
    const meta = (await fileExists(metaPath))
      ? await readJson(metaPath)
      : { retrievedAt: nowIso(), fromCache: true };
    const version =
      meta?.version ||
      (usedZip
        ? zipName?.match(/v\d+(?:\.\d+)?/i)?.[0] || undefined
        : xmlName?.match(/v\d+(?:\.\d+)?/i)?.[0] || undefined);
    return { json, meta, fromCache: true, usedXml: true, xmlRawJson: json, version };
  }

  debugLog(`[${label}] Discovering XML on`, downloadsUrl);
  const htmlBuf = await fetchBufferPinned(downloadsUrl, { headers: { accept: 'text/html,*/*' } });
  let best = await discoverLatestXmlZip(htmlBuf, downloadsUrl, xmlZipNameHintRe);
  if (!best && xmlPlainNameHintRe) {
    best = await discoverLatestXmlZip(htmlBuf, downloadsUrl, xmlPlainNameHintRe);
  }
  if (!best) {
    console.warn(`[${label}] Could not discover XML link on downloads page; skipping.`);
    return {
      json: null,
      meta: null,
      fromCache: false,
      usedXml: false,
      xmlRawJson: null,
      version: undefined,
    };
  }

  const isPlain = /\.xml$/i.test(best.url) && !/\.zip$/i.test(best.url);
  let xmlText;
  let zipBufSaved;
  if (isPlain) {
    debugLog(`[${label}] Downloading XML`, best.url);
    const xmlBuf = await fetchBufferPinned(best.url, {
      headers: { accept: 'application/xml,*/*' },
    });
    xmlText = new TextDecoder('utf-8').decode(xmlBuf);
    const xmlFile = join(vendorDir, basename(best.url));
    await writeBuffer(xmlFile, new TextEncoder().encode(xmlText));
  } else {
    debugLog(`[${label}] Downloading XML zip`, best.url);
    const zipBuf = await fetchBufferPinned(best.url, { headers: { accept: '*/*' } });
    zipBufSaved = zipBuf;
    const zipFile = join(vendorDir, basename(best.url));
    await writeBuffer(zipFile, zipBuf);
    const picked = pickFirstXmlFromZip(zipBuf);
    xmlText = picked.xmlText;
    const xmlPath = join(vendorDir, picked.xmlName);
    await writeBuffer(xmlPath, new TextEncoder().encode(xmlText));
  }

  const meta = {
    url: best.url,
    version: (best.href || '').match(/v\d+(?:\.\d+)?/i)?.[0] || undefined,
    retrievedAt: nowIso(),
    sha256: zipBufSaved ? sha256(zipBufSaved) : sha256(xmlText),
    fromCache: false,
  };
  await writeJson(join(vendorDir, 'xml.meta.json'), meta);

  const { parseXmlToJson } = await import('./_xml.mjs');
  const json = parseXmlToJson(xmlText);
  return { json, meta, fromCache: false, usedXml: true, xmlRawJson: json, version: meta.version };
}

// -------------------- normalization (CWE/CAPEC) --------------------
function normalizeCweToArray(json) {
  let items =
    json?.Weakness_Catalog?.Weaknesses?.Weakness ||
    json?.CWE_Catalog?.Weaknesses?.Weakness ||
    json?.weaknesses ||
    json?.items ||
    [];
  if (!Array.isArray(items)) items = toArray(items);

  const weaknesses = [];
  for (const w of items) {
    const rawId =
      w?.ID ?? w?.id ?? w?.Name?.ID ?? w?.cwe_id ?? w?.CWE_ID ?? w?.Weakness_ID ?? w?.['@_ID'];
    const idNum = rawId != null ? parseInt(String(rawId).replace(/^CWE-/i, ''), 10) : NaN;
    if (!Number.isFinite(idNum)) continue;

    const name = w?.Name ?? w?.name ?? w?.Title ?? w?.title ?? '';
    const description =
      stripMarkupLocal(
        getText(w?.Description ?? w?.Description_Summary ?? w?.Summary ?? w?.Notes ?? ''),
      ) || undefined;

    const status = w?.Status ?? w?.status ?? undefined;
    const abstraction = w?.Abstraction ?? w?.abstraction ?? undefined;

    const relationships = [];
    const rel1 = toArray(w?.Related_Weaknesses?.Related_Weakness);
    const rel2 = toArray(w?.Relationships?.Relationship);
    for (const r of [...rel1, ...rel2]) {
      if (!r) continue;
      const type =
        r?.Nature ?? r?.Relationship_Nature ?? r?.Relationship_Type ?? r?.Type ?? undefined;
      const targetRaw = r?.CWE_ID ?? r?.Target_ID ?? r?.Target?.ID ?? r?.Target?.CWE_ID;
      const targetId =
        targetRaw != null ? parseInt(String(targetRaw).replace(/^CWE-/i, ''), 10) : undefined;
      const targetName = r?.Name ?? r?.Target_Name ?? undefined;
      if (Number.isFinite(targetId) || type) relationships.push({ type, targetId, targetName });
    }

    const consequences = [];
    for (const c of toArray(w?.Common_Consequences?.Common_Consequence)) {
      const scope = getText(c?.Scope ?? c?.scope ?? '');
      const impact = getText(c?.Impact ?? c?.impact ?? '');
      if (scope || impact)
        consequences.push({ scope: scope || undefined, impact: impact || undefined });
    }

    const modesOfIntroduction = toArray(w?.Modes_Of_Introduction?.Introduction)
      .map((m) => getText(m?.Phase ?? m?.phase ?? m))
      .filter(Boolean);

    const likelihoodOfExploit = getText(w?.Likelihood_Of_Exploit ?? '').trim() || undefined;

    const references = toArray(w?.References?.Reference)
      .map((ref) => ({
        title: getText(ref?.Title ?? ref?.title ?? ''),
        url: getText(ref?.URL ?? ref?.url ?? ''),
      }))
      .filter((r) => r.title || r.url);

    const taxonomyMappings = toArray(
      w?.Taxonomy_Mappings?.Taxonomy_Mapping || w?.Taxonomy_Mapping || [],
    );

    weaknesses.push({
      id: idNum,
      name: String(name),
      description,
      status,
      abstraction,
      relationships: relationships.length ? relationships : undefined,
      consequences: consequences.length ? consequences : undefined,
      modesOfIntroduction: modesOfIntroduction.length ? modesOfIntroduction : undefined,
      likelihoodOfExploit,
      references: references.length ? references : undefined,
      taxonomyMappings: taxonomyMappings.length ? taxonomyMappings : undefined,
    });
  }
  weaknesses.sort((a, b) => a.id - b.id);
  return weaknesses;
}

function normalizeCapecToArray(json) {
  let items =
    json?.Attack_Pattern_Catalog?.Attack_Patterns?.Attack_Pattern ||
    json?.attack_patterns ||
    json?.items ||
    [];
  if (!Array.isArray(items)) items = toArray(items);

  const patterns = [];
  for (const ap of items) {
    const rawId = ap?.ID ?? ap?.id ?? ap?.Name?.ID ?? ap?.capec_id ?? ap?.CAPEC_ID ?? ap?.['@_ID'];
    const idNum = rawId != null ? parseInt(String(rawId).replace(/^CAPEC-/i, ''), 10) : NaN;
    if (!Number.isFinite(idNum)) continue;

    const name = ap?.Name ?? ap?.name ?? ap?.Title ?? ap?.title ?? '';
    const description = stripMarkupLocal(
      getText(ap?.Description ?? ap?.Description_Summary ?? ap?.Summary ?? ''),
    );

    const prerequisites = toArray(ap?.Prerequisites?.Prerequisite)
      .map((p) => stripMarkupLocal(getText(p)))
      .filter(Boolean);

    const relatedWeaknesses = toArray(ap?.Related_Weaknesses?.Related_Weakness)
      .map((rw) => {
        const val = rw?.CWE_ID ?? rw?.cwe_id ?? rw?.Target_ID ?? rw?.Target?.CWE_ID;
        const n = val != null ? parseInt(String(val).replace(/^CWE-/i, ''), 10) : NaN;
        return Number.isFinite(n) ? n : null;
      })
      .filter((n) => n != null);

    const consequences = toArray(ap?.Consequences?.Consequence)
      .map((c) => stripMarkupLocal(getText(c)))
      .filter(Boolean);

    const mitigations = toArray(ap?.Mitigations?.Mitigation)
      .map((m) => stripMarkupLocal(getText(m)))
      .filter(Boolean);

    const exampleInstances = toArray(ap?.Examples?.Example)
      .map((e) => stripMarkupLocal(getText(e)))
      .filter(Boolean);

    const references = toArray(ap?.References?.Reference)
      .map((ref) => ({
        title: getText(ref?.Title ?? ref?.title ?? ''),
        url: getText(ref?.URL ?? ref?.url ?? ''),
      }))
      .filter((r) => r.title || r.url);

    const relatedAttackPatterns = toArray(ap?.Related_Attack_Patterns?.Related_Attack_Pattern)
      .map((rp) => {
        const v = rp?.CAPEC_ID ?? rp?.capec_id ?? rp?.Target_ID;
        const n = v != null ? parseInt(String(v).replace(/^CAPEC-/i, ''), 10) : NaN;
        return Number.isFinite(n) ? n : null;
      })
      .filter((n) => n != null);

    patterns.push({
      id: idNum,
      name: String(name),
      description: description || undefined,
      prerequisites: prerequisites.length ? prerequisites : undefined,
      relatedWeaknesses: relatedWeaknesses.length ? relatedWeaknesses : undefined,
      consequences: consequences.length ? consequences : undefined,
      mitigations: mitigations.length ? mitigations : undefined,
      exampleInstances: exampleInstances.length ? exampleInstances : undefined,
      references: references.length ? references : undefined,
      relatedAttackPatterns: relatedAttackPatterns.length ? relatedAttackPatterns : undefined,
    });
  }
  patterns.sort((a, b) => a.id - b.id);
  return patterns;
}

// -------------------- pipelines --------------------
async function runAttack() {
  const { json: stix } = await fetchAttackVendorJson();
  if (!stix) return { techniques: 0, tactics: 0 };

  const attack = normalizeAttack(stix);
  await mkdir(OUT_DIR_INGEST, { recursive: true });
  await mkdir(OUT_DIR_MITRE, { recursive: true });
  const p1 = join(OUT_DIR_INGEST, 'attack.json');
  const p2 = join(OUT_DIR_MITRE, 'attack.json');
  const jsonText = JSON.stringify(attack, null, 2);
  await writeFile(p1, jsonText, 'utf8');
  await writeFile(p2, jsonText, 'utf8');

  await ensureDir(attackRawDir);
  const meta = {
    retrievedAt: nowIso(),
    techniques: attack.techniques.length,
    tactics: attack.tactics.length,
  };
  await writeJson(join(attackRawDir, 'meta.json'), meta);
  console.log(
    `[mitre] attack.json written (${attack.techniques.length} techniques, ${attack.tactics.length} tactics)`,
  );
  return { techniques: attack.techniques.length, tactics: attack.tactics.length };
}

async function runCwe() {
  await ensureDir(cweVendorDir);
  await ensureDir(cweRawDir);
  await mkdir(OUT_DIR_INGEST, { recursive: true });
  let json = null;
  let fromCache = false;
  let version;
  let metaHeaders = { etag: undefined, lastModified: undefined };
  // Prefer explicit URL if provided, else defaults
  const urls = (MITRE_CWE_URL ? [MITRE_CWE_URL] : DEFAULT_CWE_URLS).filter(Boolean);

  // Local override (can be json or zip)
  if (MITRE_CWE_FILE) {
    debugLog('[cwe] Using local file override:', MITRE_CWE_FILE);
    if (extname(MITRE_CWE_FILE).toLowerCase() === '.zip') {
      const buf = await readBuffer(MITRE_CWE_FILE);
      json = decodeJsonFromZipBuffer(buf);
    } else {
      const raw = await readFile(MITRE_CWE_FILE, 'utf8');
      json = JSON.parse(raw);
    }
  } else {
    const {
      json: j1,
      fromCache: fc1,
      shouldFallback,
    } = await tryJsonZipToJson(urls, cweVendorDir, 'cwe', 'cwe');
    json = j1;
    fromCache = fc1;
    if (shouldFallback || !json) {
      // XML fallback
      const {
        json: j2,
        fromCache: fc2,
        xmlRawJson,
        version: v2,
      } = await loadViaXmlFallback({
        downloadsUrl: CWE_DOWNLOADS_URL,
        vendorDir: cweVendorDir,
        label: 'cwe',
        xmlZipNameHintRe: CWE_XML_ZIP_RE,
        xmlPlainNameHintRe: CWE_XML_PLAIN_RE,
      });
      json = j2;
      fromCache = fc2;
      version = v2;
      if (xmlRawJson) {
        await writeJson(join(cweRawDir, '_raw.xml.json'), xmlRawJson);
      }
    }
  }

  if (!json) {
    console.warn('[cwe] No dataset available (offline with no cache or fetch failed). Skipping.');
    return { count: 0, version: undefined };
  }

  const arr = normalizeCweToArray(json);
  await writeJson(join(cweRawDir, 'cwec.json'), arr);

  // meta
  const meta = {
    url: json?.sourceUrl || undefined,
    retrievedAt: nowIso(),
    version:
      version ||
      json?.Weakness_Catalog?.Version ||
      json?.CWE_Catalog?.Version ||
      json?.version ||
      undefined,
    etag: metaHeaders.etag,
    lastModified: metaHeaders.lastModified,
    sha256: sha256(JSON.stringify(arr)),
    fromCache,
    count: arr.length,
  };
  await writeJson(join(cweRawDir, 'meta.json'), meta);

  // back-compat mapping
  const map = {};
  for (const w of arr) map[`CWE-${w.id}`] = w.name;
  await writeJson(join(OUT_DIR_INGEST, 'cwe.json'), map);

  console.log(
    `[cwe] normalized=${arr.length} raw=${join(cweRawDir, 'cwec.json')} meta=${join(cweRawDir, 'meta.json')}`,
  );
  return { count: arr.length, version: meta.version };
}

async function runCapec() {
  await ensureDir(capecVendorDir);
  await ensureDir(capecRawDir);
  await mkdir(OUT_DIR_INGEST, { recursive: true });
  let json = null;
  let fromCache = false;
  let version;
  // Prefer explicit URL if provided, else defaults
  const urls = (MITRE_CAPEC_URL ? [MITRE_CAPEC_URL] : DEFAULT_CAPEC_URLS).filter(Boolean);

  if (MITRE_CAPEC_FILE) {
    debugLog('[capec] Using local file override:', MITRE_CAPEC_FILE);
    if (extname(MITRE_CAPEC_FILE).toLowerCase() === '.zip') {
      const buf = await readBuffer(MITRE_CAPEC_FILE);
      json = decodeJsonFromZipBuffer(buf);
    } else {
      const raw = await readFile(MITRE_CAPEC_FILE, 'utf8');
      json = JSON.parse(raw);
    }
  } else {
    const {
      json: j1,
      fromCache: fc1,
      shouldFallback,
    } = await tryJsonZipToJson(urls, capecVendorDir, 'capec', 'capec');
    json = j1;
    fromCache = fc1;
    if (shouldFallback || !json) {
      const {
        json: j2,
        fromCache: fc2,
        xmlRawJson,
        version: v2,
      } = await loadViaXmlFallback({
        downloadsUrl: CAPEC_DOWNLOADS_URL,
        vendorDir: capecVendorDir,
        label: 'capec',
        xmlZipNameHintRe: CAPEC_XML_ZIP_RE,
        xmlPlainNameHintRe: CAPEC_XML_PLAIN_RE,
      });
      json = j2;
      fromCache = fc2;
      version = v2;
      if (xmlRawJson) {
        await writeJson(join(capecRawDir, '_raw.xml.json'), xmlRawJson);
      }
    }
  }

  if (!json) {
    console.warn('[capec] No dataset available (offline with no cache or fetch failed). Skipping.');
    return { count: 0, version: undefined };
  }

  const arr = normalizeCapecToArray(json);
  await writeJson(join(capecRawDir, 'capec.json'), arr);

  // meta
  const meta = {
    url: json?.sourceUrl || undefined,
    retrievedAt: nowIso(),
    version: version || json?.Attack_Pattern_Catalog?.Version || json?.version || undefined,
    etag: undefined,
    lastModified: undefined,
    sha256: sha256(JSON.stringify(arr)),
    fromCache,
    count: arr.length,
  };
  await writeJson(join(capecRawDir, 'meta.json'), meta);

  // back-compat mapping
  const map = {};
  for (const p of arr) map[`CAPEC-${p.id}`] = p.name;
  await writeJson(join(OUT_DIR_INGEST, 'capec.json'), map);

  console.log(
    `[capec] normalized=${arr.length} raw=${join(capecRawDir, 'capec.json')} meta=${join(capecRawDir, 'meta.json')}`,
  );
  return { count: arr.length, version: meta.version };
}

// -------------------- main --------------------
async function main() {
  await mkdir(OUT_DIR_INGEST, { recursive: true });
  await mkdir(OUT_DIR_MITRE, { recursive: true });

  const attackCounts = await runAttack();
  const cweMeta = await runCwe();
  const capecMeta = await runCapec();

  if (STDOUT) {
    console.log(
      JSON.stringify({
        mitre: {
          attack: attackCounts,
          cwe: cweMeta,
          capec: capecMeta,
        },
      }),
    );
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
