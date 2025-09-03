import { getCollection } from 'astro:content';
import { buildIndexPayload } from '../lib/searchBuild';
import { deriveSourceKinds, deriveTypeCategory } from '../lib/facets';
declare const __BUILD_TIME__: string | number;

/**
 * /search.json payload
 * Shape:
 * {
 *   v: buildTimestamp,
 *   options: MiniSearch options (including boosts),
 *   index: stringified MiniSearch JSON (revivable with MiniSearch.loadJSON)
 * }
 * Stored fields per document (kept minimal):
 *   id, term, acronym, tags, sourceKinds, typeCategory, aliasTokens, slugTokens, titleTokens
 * Notes:
 * - Synonym expansion occurs at build time (server); no client import of synonyms.json.
 * - Avoid embedding heavy source objects to keep payload lean.
 */
export const prerender = true;

type Doc = {
  id: string;
  term: string;
  acronym?: string[];
  aliases?: string[];
  text: string;
  tags: string[];
  sourceKinds: string[];
  typeCategory: string;
};

function unique<T>(arr: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const item of arr) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

export async function GET() {
  const entries = await getCollection('terms');

  const docs: Doc[] = entries.map((e) => {
    const data = e.data as any;
    const tags: string[] = Array.isArray(data.tags) ? data.tags.map((t: any) => String(t)) : [];
    const sourceKinds = deriveSourceKinds(data);
    const typeCategory = deriveTypeCategory(String(data.term || ''), tags, data.mappings || {});
    return {
      id: e.slug,
      term: data.term,
      acronym: data.acronym,
      aliases: data.aliases,
      text: [
        data.summary,
        ...(Array.isArray(data.sources) ? data.sources : []).map(
          (s: any) => `${s.citation || ''} ${s.excerpt || ''}`,
        ),
      ]
        .filter(Boolean)
        .join(' '),
      tags,
      sourceKinds: unique(sourceKinds),
      typeCategory,
    };
  });

  // Build MiniSearch index with enriched token fields and alias expansion
  const payload = buildIndexPayload(docs as any);

  // Minimal meta for client UI (tags multi-select). Kept small to preserve budgets.
  const tagsMeta = Array.from(
    new Set(docs.flatMap((d) => (Array.isArray(d.tags) ? d.tags : []))),
  ).sort();

  return new Response(JSON.stringify({ v: __BUILD_TIME__, tags: tagsMeta, ...payload }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
