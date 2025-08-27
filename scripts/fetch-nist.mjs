/**
 * scripts/fetch-nist.mjs
 * NIST CSRC Glossary ETL with vendor caching (ZIP), unzip, normalization, and back-compat outputs.
 * - URL: https://csrc.nist.gov/csrc/media/glossary/glossary-export.zip
 * - Caching: data/vendor/nist/glossary-export.zip + .meta.json with TTL, force-refresh, offline support
 * - Normalized raw: data/raw/nist/glossary.json + meta.json
 * - Back-compat: data/ingest/nist/*.json and data/nist/glossary.json
 */
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
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

const OFFLINE = /^(1|true|yes)$/i.test(String(process.env.ETL_OFFLINE || ''));
const FORCE = /^(1|true|yes)$/i.test(String(process.env.ETL_FORCE_REFRESH || ''));
const TTL_HOURS = Number.parseInt(String(process.env.ETL_CACHE_TTL_HOURS || '24'), 10) || 24;

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

  // Deterministic order by slug id
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
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

  const { buf, meta, fromCache } = await loadVendorZip();
  if (!buf) return; // offline skip

  const { name: innerName, json } = pickFirstJsonFromZip(buf);
  debugLog('[nist] Picked JSON from ZIP:', innerName);

  // Normalize to raw dataset and write meta
  const entries = normalizeEntries(json);
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
