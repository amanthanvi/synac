/**
 * scripts/_verify_utils.mjs
 * Shared helpers for verifying merged datasets: sorting, hashing normalization, counts, and meta checks.
 * Pure ESM, no external deps.
 */

/**
 * Produce a deep-cloned object with keys of objects sorted lexicographically.
 * Arrays are preserved (with their elements processed recursively).
 */
export function stableSortObject(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(stableSortObject);
  const out = {};
  for (const k of Object.keys(v).sort()) {
    out[k] = stableSortObject(v[k]);
  }
  return out;
}

/**
 * Simple deep clone via JSON stringify/parse for data-only objects.
 */
export function cloneDeep(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}

/**
 * Heuristically locate arrays within a section value. Prefers common keys, but also falls back to any array fields.
 */
export function findArraysInSection(val) {
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

/**
 * Pick the primary array among many arrays in a section (the longest one by length).
 */
export function pickPrimaryArray(arrays) {
  if (!arrays.length) return null;
  const copy = arrays.slice().sort((a, b) => (b.arr?.length || 0) - (a.arr?.length || 0));
  return copy[0];
}

/**
 * Build a comparator for a list of items based on common keys (id/title/name) or direct value.
 */
export function comparatorForItems(items) {
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
    const pa = typeof va === 'string' && /^\d+$/.test(va) ? Number.parseInt(va, 10) : NaN;
    const pb = typeof vb === 'string' && /^\d+$/.test(vb) ? Number.parseInt(vb, 10) : NaN;
    if (Number.isFinite(pa) && Number.isFinite(pb)) return pa - pb;
    return String(va).localeCompare(String(vb));
  };
}

/**
 * Check if an array is sorted under the provided comparator.
 */
export function isSorted(arr, cmp) {
  for (let i = 1; i < arr.length; i++) {
    if (cmp(arr[i - 1], arr[i]) > 0) return false;
  }
  return true;
}

/**
 * Create a normalized copy of merged suitable for hashing: ensures arrays are sorted deterministically.
 * Appends human-readable warnings to the provided warnings array when it detects unsorted arrays.
 */
export function normalizeForHash(merged, warnings) {
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

/**
 * Compute per-section and overall counts. Uses the primary array heuristic for sections that have multiple arrays.
 */
export function deriveCounts(merged) {
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

/**
 * Validate that meta.sources exists and contains at least some provenance fields per data section.
 * Returns an array of violation strings (empty if none).
 */
export function checkMeta(merged) {
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

/**
 * Pretty-print a summary string that includes section counts, total, and content hash.
 */
export function prettySummary({ sections, overall }, contentHash) {
  const parts = sections.map((s) =>
    s.details ? `${s.key}: ${s.count} (${s.details})` : `${s.key}: ${s.count}`,
  );
  return [
    `Counts → ${parts.join(' | ')}`,
    `Total → ${overall}`,
    `Content SHA-256 → ${contentHash}`,
  ].join('\n');
}
