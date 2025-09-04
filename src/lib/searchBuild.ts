import MiniSearch from 'minisearch';
import { searchOptions } from './searchOptions';
import { normalizePhrases, normalizeTokens } from './tokenize';
// JSON import is build-time only; not shipped to client
// @ts-ignore - resolveJsonModule is provided by Astro's tsconfig
import SYNONYMS from '../search/synonyms.json';

export type SearchDoc = {
  id: string;
  term: string;
  acronym?: string[];
  aliases?: string[];
  text: string;
  tags: string[];
  sourceKinds: string[];
  // Derived fields (not necessarily stored in payload)
  typeCategory?: string;
  aliasTokens?: string[];
  slugTokens?: string[];
  titleTokens?: string[];
};

type SynonymEntry = {
  aliases?: string[];
  sources?: Array<{ label: string; id: string; type?: string }>;
};
type SynonymMap = Record<string, SynonymEntry | undefined>;

/**
 * Augment a document with normalized token fields and canonical aliasTokens.
 * - Highest boost: slugTokens (id) and titleTokens (term)
 * - Medium: aliasTokens (from synonyms.json and frontmatter aliases)
 * - Lower: text/tags/sourceKinds (handled by searchOptions boosts)
 */
function enrichDoc(doc: SearchDoc, synonyms: SynonymMap): SearchDoc {
  const slugTokens = normalizeTokens(doc.id);
  const titleTokens = normalizeTokens(doc.term);

  // Start with any frontmatter-provided aliases, then add canonical synonyms keyed by slug
  const aliasPhrases = Array.isArray(doc.aliases) ? doc.aliases : [];
  const canonical = synonyms[doc.id]?.aliases || [];
  const aliasTokens = Array.from(
    new Set<string>([...normalizePhrases(aliasPhrases), ...normalizePhrases(canonical)]),
  );

  return {
    ...doc,
    slugTokens,
    titleTokens,
    aliasTokens,
  };
}

/**
 * Build a MiniSearch index payload given normalized docs.
 * Returns options and a serialized index JSON that can be revived client-side via MiniSearch.loadJSON.
 * Important: we do not create extra documents; we only expand the token vocabulary for existing docs.
 */
export function buildIndexPayload(docs: SearchDoc[]) {
  const expanded = docs.map((d) => enrichDoc(d, SYNONYMS as SynonymMap));
  const mini = new MiniSearch(searchOptions as any);
  mini.addAll(expanded as any);
  return {
    options: searchOptions,
    index: JSON.stringify(mini.toJSON()),
  };
}
