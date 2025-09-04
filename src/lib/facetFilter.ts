/**
 * Shared facet filtering and deterministic sorting.
 * Keep logic in sync between client, tests, and any server utilities.
 */

export type FacetSelections = {
  sources?: string[];
  types?: string[];
  tags?: string[];
};

type ResultRow = {
  id?: string;
  score?: number;
  sourceKinds?: string[];
  typeCategory?: string;
  tags?: string[];
};

export function applyFacetFilters<T extends ResultRow>(results: T[], sel: FacetSelections): T[] {
  const srcSel = Array.isArray(sel.sources) ? sel.sources : [];
  const typeSel = Array.isArray(sel.types) ? sel.types : [];
  const tagSel = Array.isArray(sel.tags) ? sel.tags : [];

  const filtered = results.filter((r) => {
    if (srcSel.length) {
      const kinds = Array.isArray(r.sourceKinds) ? r.sourceKinds : [];
      for (const s of srcSel) if (!kinds.includes(s)) return false;
    }
    if (typeSel.length) {
      const t = String(r.typeCategory || '');
      if (!typeSel.includes(t)) return false;
    }
    if (tagSel.length) {
      const tags = Array.isArray(r.tags) ? r.tags : [];
      for (const t of tagSel) if (!tags.includes(t)) return false;
    }
    return true;
  });

  // Deterministic sort: score desc, then id asc
  filtered.sort((a, b) => {
    const sa = typeof a.score === 'number' ? a.score : 0;
    const sb = typeof b.score === 'number' ? b.score : 0;
    if (sb !== sa) return sb - sa;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });

  return filtered;
}
