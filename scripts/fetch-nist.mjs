/**
 * scripts/fetch-nist.mjs
 * Scaffold: fetch NIST CSRC Glossary JSON and normalize into data/ingest/nist/*.json
 *
 * Notes:
 * - This is a scaffold. Endpoint formats can change; prefer pinning via env var NIST_GLOSSARY_URL.
 * - If the public JSON endpoint is unavailable, you can export data manually and set NIST_GLOSSARY_FILE
 *   to a local JSON file, and this script will read from it instead of fetching.
 *
 * Output fragment shape (per id):
 * {
 *   id: "zero-trust",
 *   sources: [{
 *     kind: "NIST",
 *     citation: "NIST CSRC Glossary",
 *     url: "https://csrc.nist.gov/glossary/term/zero-trust",
 *     date: "YYYY-MM",
 *     excerpt: "Short definition/excerpt",
 *     normative: true
 *   }],
 *   updatedAt: "ISO-STRING"
 * }
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OUT_DIR = join(__dirname, '..', 'data', 'ingest', 'nist');
const NIST_GLOSSARY_URL =
  process.env.NIST_GLOSSARY_URL ||
  // Potential (example) endpoint; replace with the confirmed export URL when available:
  'https://csrc.nist.gov/glossary/api/terms?format=json';
const NIST_GLOSSARY_FILE = process.env.NIST_GLOSSARY_FILE; // optional local override

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
  // CSRC term pages are typically: /glossary/term/{term} (URL-encoded)
  const encoded = encodeURIComponent(String(term || '').trim());
  return `https://csrc.nist.gov/glossary/term/${encoded}`;
}

async function fetchJson(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 30000);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function readLocalJson(path) {
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw);
}

function normalizeEntries(json) {
  // The shape of the CSRC JSON may vary. Try common field names; otherwise, attempt best-effort mapping.
  // Expected fields we try to derive: term, definition/excerpt, date.
  const list = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
  const nowIso = new Date().toISOString();
  const out = [];

  for (const item of list) {
    const term =
      item?.term ||
      item?.title ||
      item?.name ||
      (typeof item === 'object' && Object.keys(item).includes('Term') ? item['Term'] : undefined);

    if (!term) continue;

    const excerpt =
      item?.definition ||
      item?.excerpt ||
      item?.desc ||
      item?.Definition ||
      item?.Description ||
      item?.short_definition ||
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
      updatedAt: nowIso,
    });
  }
  return out;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  let data;
  if (NIST_GLOSSARY_FILE) {
    console.log(`[nist] Reading local file: ${NIST_GLOSSARY_FILE}`);
    data = await readLocalJson(NIST_GLOSSARY_FILE);
  } else {
    console.log(`[nist] Fetching: ${NIST_GLOSSARY_URL}`);
    try {
      data = await fetchJson(NIST_GLOSSARY_URL);
    } catch (err) {
      console.error(`[nist] Fetch failed: ${err.message}`);
      console.error(
        `[nist] Tip: export JSON locally and set NIST_GLOSSARY_FILE=/path/to/file.json`,
      );
      process.exitCode = 1;
      return;
    }
  }

  const entries = normalizeEntries(data);
  let count = 0;
  for (const frag of entries) {
    if (!frag?.id) continue;
    const outPath = join(OUT_DIR, `${frag.id}.json`);
    await writeFile(outPath, JSON.stringify(frag, null, 2), 'utf8');
    count++;
  }
  console.log(`[nist] Wrote ${count} fragment(s) to ${OUT_DIR}`);
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
