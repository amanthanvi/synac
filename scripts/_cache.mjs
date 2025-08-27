/**
 * scripts/_cache.mjs
 * Lightweight file cache utilities with TTL and force-refresh controls.
 * Env:
 *  - ETL_CACHE_TTL_HOURS (default 24)
 *  - ETL_FORCE_REFRESH=true to bypass freshness
 */
import { promises as fs } from 'node:fs';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

export function getDirs(source) {
  return {
    vendorDir: join(ROOT, 'data', 'vendor', source),
    rawDir: join(ROOT, 'data', 'raw', source),
  };
}

export async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

export function nowIso() {
  return new Date().toISOString();
}

export function sha256(input) {
  const h = createHash('sha256');
  if (typeof input === 'string') h.update(input);
  else if (input instanceof Uint8Array) h.update(input);
  else if (Buffer.isBuffer(input)) h.update(input);
  else if (input != null) h.update(Buffer.from(input));
  return h.digest('hex');
}

async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(p) {
  const raw = await readFile(p, 'utf8');
  return JSON.parse(raw);
}

export async function writeJson(p, data) {
  await ensureDir(dirname(p));
  await writeFile(p, JSON.stringify(data, null, 2), 'utf8');
}

export async function writeBuffer(p, buf) {
  await ensureDir(dirname(p));
  await fs.writeFile(p, buf);
}

export async function readBuffer(p) {
  return new Uint8Array(await fs.readFile(p));
}

/**
 * Determine if cache at metaPath is fresh under TTL unless forced refresh
 * @param {string} metaPath path to JSON meta with { retrievedAt }
 * @param {number|undefined} ttlHours override TTL hours
 * @param {boolean|undefined} forceRefresh override force
 * @returns {Promise<boolean>}
 */
export async function isFresh(metaPath, ttlHours, forceRefresh) {
  const force =
    typeof forceRefresh === 'boolean'
      ? forceRefresh
      : /^(1|true|yes)$/i.test(String(process.env.ETL_FORCE_REFRESH || ''));
  if (force) return false;

  const ttl = Number.isFinite(ttlHours)
    ? ttlHours
    : Number.parseInt(String(process.env.ETL_CACHE_TTL_HOURS || '24'), 10) || 24;

  if (!(await fileExists(metaPath))) return false;

  try {
    const meta = await readJson(metaPath);
    const ts = Date.parse(String(meta?.retrievedAt || ''));
    if (!Number.isFinite(ts)) return false;
    const ageMs = Date.now() - ts;
    return ageMs < ttl * 3600 * 1000;
  } catch {
    return false;
  }
}
