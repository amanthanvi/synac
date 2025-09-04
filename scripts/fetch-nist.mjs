/**
 * scripts/fetch-nist.mjs
 * NIST CSRC Glossary ETL with vendor caching (ZIP), unzip, normalization, and back-compat outputs.
 * - URL: https://csrc.nist.gov/csrc/media/glossary/glossary-export.zip
 * - Caching: data/vendor/nist/glossary-export.zip + .meta.json with TTL, force-refresh, offline support
 * - Normalized raw: data/raw/nist/glossary.json + meta.json
 * - Back-compat: data/ingest/nist/*.json and data/nist/glossary.json
 */
import { mkdir, writeFile, readFile, stat, readdir } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { TextDecoder } from 'node:util';
import { fetchBufferPinned } from './_http.mjs';
import {
  getDirs,
  ensureDir,
  sha256,
  nowIso,
  isFresh,
  writeJson,
  readJson,
  writeBuffer,
  readBuffer,
} from './_cache.mjs';
import { debugLog } from './_log.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { vendorDir, rawDir } = getDirs('nist');
const OUT_DIR_FRAG = join(__dirname, '..', 'data', 'ingest', 'nist');
const OUT_DIR_ALL = join(__dirname, '..', 'data', 'nist');
const OUT_FILE_ALL = join(OUT_DIR_ALL, 'glossary.json');

const NIST_ZIP_URL = 'https://csrc.nist.gov/csrc/media/glossary/glossary-export.zip';
const VENDOR_ZIP = join(vendorDir, 'glossary-export.zip');
const VENDOR_META = join(vendorDir, 'glossary-export.zip.meta.json');
const RAW_JSON = join(rawDir, 'glossary.json');
const RAW_META = join(rawDir, 'meta.json');
const BUILD_MERGED = join(__dirname, '..', 'data', 'build', 'merged.json');

const OFFLINE = /^(1|true|yes)$/i.test(String(process.env.ETL_OFFLINE || ''));
const FORCE = /^(1|true|yes)$/i.test(String(process.env.ETL_FORCE_REFRESH || ''));
const TTL_HOURS = Number.parseInt(String(process.env.ETL_CACHE_TTL_HOURS || '24'), 10) || 24;
// Allow deterministic fallback by default; set ETL_ALLOW_FALLBACK=false to preserve fail-fast behavior.
const ALLOW_FALLBACK = !/^(0|false|no)$/i.test(String(process.env.ETL_ALLOW_FALLBACK ?? 'true'));

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildTermUrl(term) {
  const encoded = encodeURIComponent(String(term || '').trim());
  return `https://csrc.nist.gov/glossary/term/${encoded}`;
}

async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

function normalizeEntries(json) {
  // Try to accommodate both "entries"/"terms"/flat-array shapes
  const list = Array.isArray(json?.entries)
    ? json.entries
    : Array.isArray(json?.data)
      ? json.data
      : Array.isArray(json?.terms)
        ? json.terms
        : Array.isArray(json)
          ? json
          : [];
  const now = nowIso();
  const out = [];

  for (const item of list) {
    const term =
      item?.term ||
      item?.title ||
      item?.name ||
      (typeof item === 'object' && Object.prototype.hasOwnProperty.call(item, 'Term')
        ? item['Term']
        : undefined);
    if (!term) continue;

    const excerpt =
      item?.definition ||
      item?.Definition ||
      item?.desc ||
      item?.Description ||
      item?.short_definition ||
      item?.excerpt ||
      '';

    const date =
      item?.date ||
      item?.updated ||
      item?.lastUpdated ||
      item?.publicationDate ||
      item?.pubDate ||
      '';

    const id = slugify(term);
    const url = buildTermUrl(term);

    out.push({
      id,
      sources: [
        {
          kind: 'NIST',
          citation: 'NIST CSRC Glossary',
          url,
          date: String(date || '').slice(0, 7) || undefined,
          excerpt:
            String(excerpt || '')
              .trim()
              .slice(0, 400) || undefined,
          normative: true,
        },
      ],
      updatedAt: now,
    });
  }

  // Deterministic order by slug id + dedupe
  const byId = new Map();
  for (const frag of out) {
    if (!frag?.id) continue;
    const k = String(frag.id).trim();
    if (!byId.has(k)) byId.set(k, frag);
  }
  const deduped = Array.from(byId.values());
  deduped.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return deduped;
}

function pickFirstJsonFromZip(buf) {
  const files = unzipSync(buf);
  let pickedName = null;
  let picked = null;
  for (const [name, content] of Object.entries(files)) {
    if (name.toLowerCase().endsWith('.json')) {
      pickedName = name;
      picked = content;
      break;
    }
  }
  if (!picked) throw new Error('NIST ZIP did not contain a .json file');
  const text = new TextDecoder('utf-8').decode(picked);
  return { name: pickedName, json: JSON.parse(text) };
}

async function loadVendorZip() {
  // If offline, read the cached file regardless of TTL
  if (OFFLINE) {
    if (await fileExists(VENDOR_ZIP)) {
      debugLog('[nist] Offline: using cached vendor ZIP', VENDOR_ZIP);
      const buf = await readBuffer(VENDOR_ZIP);
      const meta = (await fileExists(VENDOR_META)) ? await readJson(VENDOR_META) : null;
      return { buf, meta, fromCache: true };
    }
    console.warn('[nist] Offline and no cached vendor ZIP present; skipping.');
    return { buf: null, meta: null, fromCache: true };
  }

  // Online path: respect TTL unless force
  const fresh = await isFresh(VENDOR_META, TTL_HOURS, FORCE);
  if (fresh && (await fileExists(VENDOR_ZIP))) {
    debugLog('[nist] Cache fresh: reusing vendor ZIP', VENDOR_ZIP);
    const buf = await readBuffer(VENDOR_ZIP);
    const meta = await readJson(VENDOR_META);
    return { buf, meta, fromCache: true };
  }

  debugLog('[nist] Downloading ZIP:', NIST_ZIP_URL);
  const buf = await fetchBufferPinned(NIST_ZIP_URL, { headers: { accept: '*/*' } });
  await ensureDir(vendorDir);
  await writeBuffer(VENDOR_ZIP, buf);

  const meta = {
    url: NIST_ZIP_URL,
    retrievedAt: nowIso(),
    sha256: sha256(buf),
    etag: undefined,
    lastModified: undefined,
    version: undefined,
    fromCache: false,
  };
  await writeJson(VENDOR_META, meta);
  return { buf, meta, fromCache: false };
}

async function main() {
  await ensureDir(vendorDir);
  await ensureDir(rawDir);
  await mkdir(OUT_DIR_FRAG, { recursive: true });
  await mkdir(OUT_DIR_ALL, { recursive: true });

  // Conservative fallback: if upstream is flaky or empty, reuse last-known-good cache.
  // Controlled by ETL_ALLOW_FALLBACK (default "true"). Keeps outputs deterministic and non-empty for CI.
  let buf = null;
  let meta = null;
  let fromCache = false;

  try {
    const res = await loadVendorZip();
    buf = res.buf;
    meta = res.meta;
    fromCache = res.fromCache;
  } catch (e) {
    console.warn('[nist] Error loading vendor ZIP:', e?.message || e);
  }

  async function tryFallback() {
    // Prefer normalized raw artifact
    if (await fileExists(RAW_JSON)) {
      try {
        const cached = await readJson(RAW_JSON);
        if (Array.isArray(cached) && cached.length > 0) return cached;
      } catch {}
    }

    // Then consolidated back-compat file
    if (await fileExists(OUT_FILE_ALL)) {
      try {
        const consolidated = await readJson(OUT_FILE_ALL);
        const arr = Array.isArray(consolidated?.entries) ? consolidated.entries : [];
        if (arr.length > 0) return arr;
      } catch {}
    }

    // Next, reconstruct from existing fragments under data/ingest/nist/*.json (committed back-compat)
    try {
      const dirFiles = await readdir(OUT_DIR_FRAG).catch(() => []);
      if (Array.isArray(dirFiles) && dirFiles.length > 0) {
        const frags = [];
        for (const name of dirFiles) {
          if (!name.toLowerCase().endsWith('.json')) continue;
          try {
            const fp = join(OUT_DIR_FRAG, name);
            const text = await readFile(fp, 'utf8');
            const json = JSON.parse(text);
            if (json && typeof json === 'object' && json.id && Array.isArray(json.sources)) {
              frags.push(json);
            }
          } catch {
            // ignore individual parse errors; continue best-effort
          }
        }
        if (frags.length > 0) return frags;
      }
    } catch {
      // ignore and proceed to next fallback
    }

    // Finally, derive from canonical merged cache if present (stable, last-known-good)
    if (await fileExists(BUILD_MERGED)) {
      try {
        const merged = await readJson(BUILD_MERGED);
        const data = Array.isArray(merged?.data)
          ? merged.data
          : Array.isArray(merged)
            ? merged
            : [];
        const arr = [];
        for (const item of data) {
          const id = String(item?.id || '')
            .toLowerCase()
            .trim();
          if (!id) continue;
          const srcs = Array.isArray(item?.sources) ? item.sources : [];
          const nistSources = srcs.filter((s) => String(s?.kind || '').toUpperCase() === 'NIST');
          if (nistSources.length === 0) continue;
          arr.push({
            id,
            sources: nistSources.map((s) => ({
              ...s,
              citation: s?.citation != null ? String(s.citation).trim() : s?.citation,
              url: s?.url != null ? String(s.url).trim() : s?.url,
              excerpt: s?.excerpt != null ? String(s.excerpt).trim().slice(0, 400) : s?.excerpt,
              date: s?.date != null ? String(s.date).trim().slice(0, 7) : s?.date,
              kind: s?.kind != null ? String(s.kind).trim() : s?.kind,
              normative: s?.normative !== undefined ? !!s.normative : s?.normative,
            })),
            updatedAt: nowIso(),
          });
        }
        if (arr.length > 0) return arr;
      } catch {}
    }
    return [];
  }

  let entries = [];

  if (buf) {
    try {
      const { name: innerName, json } = pickFirstJsonFromZip(buf);
      debugLog('[nist] Picked JSON from ZIP:', innerName);
      entries = normalizeEntries(json);
    } catch (e) {
      console.warn(
        '[nist] Failed to parse/normalize upstream ZIP; attempting cached fallback. Error:',
        e?.message || e,
      );
      entries = [];
    }
  }

  if (!entries || entries.length === 0) {
    if (ALLOW_FALLBACK) {
      const fb = await tryFallback();
      if (fb.length > 0) {
        console.warn(
          '[nist] Upstream empty/invalid; reusing last-known-good cached dataset (ETL_ALLOW_FALLBACK=true).',
        );
        entries = fb;
        fromCache = true;
      } else {
        throw new Error('[nist] Upstream empty/invalid and no cached fallback available');
      }
    } else {
      throw new Error('[nist] Upstream empty/invalid and ETL_ALLOW_FALLBACK=false');
    }
  }

  // Ensure deterministic normalized output: trim fields, dedupe, sort by slug.
  // normalizeEntries already trims and lowercases; re-apply safeguards when using fallback inputs.
  entries = entries
    .map((frag) => ({
      ...frag,
      id: String(frag?.id || '')
        .toLowerCase()
        .trim(),
      sources: Array.isArray(frag?.sources)
        ? frag.sources.map((s) => ({
            ...s,
            citation: s?.citation != null ? String(s.citation).trim() : s?.citation,
            url: s?.url != null ? String(s.url).trim() : s?.url,
            excerpt: s?.excerpt != null ? String(s.excerpt).trim().slice(0, 400) : s?.excerpt,
            date: s?.date != null ? String(s.date).trim().slice(0, 7) : s?.date,
            kind: s?.kind != null ? String(s.kind).trim() : s?.kind,
          }))
        : frag?.sources,
      updatedAt: frag?.updatedAt || nowIso(),
    }))
    .filter((f) => f.id);

  const seen = new Set();
  const deduped = [];
  for (const f of entries) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    deduped.push(f);
  }
  deduped.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  entries = deduped;

  const rawMeta = {
    sourceUrl: NIST_ZIP_URL,
    retrievedAt: meta?.retrievedAt || nowIso(),
    version: meta?.version,
    etag: meta?.etag,
    lastModified: meta?.lastModified,
    sha256: meta?.sha256,
    fromCache,
    count: entries.length,
  };
  await writeJson(RAW_JSON, entries);
  await writeJson(RAW_META, rawMeta);

  // Back-compat outputs
  let count = 0;
  for (const frag of entries) {
    if (!frag?.id) continue;
    const outPath = join(OUT_DIR_FRAG, `${frag.id}.json`);
    await writeFile(outPath, JSON.stringify(frag, null, 2), 'utf8');
    count++;
  }

  const consolidated = { source: 'NIST CSRC', fetchedAt: rawMeta.retrievedAt, count, entries };
  await writeFile(OUT_FILE_ALL, JSON.stringify(consolidated, null, 2), 'utf8');

  console.log(`[nist] entries=${entries.length} raw=${RAW_JSON} meta=${RAW_META}`);
  debugLog('[nist] Back-compat:', OUT_DIR_FRAG, OUT_FILE_ALL);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
