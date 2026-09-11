import { v } from 'convex/values';
import { query } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { activeGeneration } from './lib/contentGeneration';

const STOPWORDS = ['a', 'an', 'and', 'or', 'the'];
/**
 * Ceiling on every candidate scan. `total` therefore counts the matches inside
 * this bound: a query that matches more entries than the cap reports the cap,
 * not the true corpus count.
 */
const CANDIDATE_CAP = 200;
const SNIPPET_CHARS = 200;
const SNIPPET_LEAD = 60;

const entryTypeFilter = v.optional(
  v.union(v.literal('TERM'), v.literal('ACRONYM'), v.null()),
);

type EntryType = 'TERM' | 'ACRONYM';

type NormalizedQuery = {
  raw: string;
  text: string;
  slug: string;
  terms: string[];
};

type SearchResult = {
  key: string;
  entryType: EntryType;
  title: string;
  slug: string;
  summaryText: string | null;
  snippet: string | null;
  senseCount: number;
  senseSummary: string | null;
};

type SenseResult = {
  entryType: EntryType;
  slug: string;
  title: string;
  senseKey: string;
  anchor: string;
  label: string | null;
  expandedForm: string | null;
  labelFallback: string;
  sourceNames: string[];
  snippet: string | null;
};

type Page<T> = { results: T[]; total: number; hasMore: boolean };

function normalizeQuery(value: string): NormalizedQuery | null {
  const raw = value.trim().slice(0, 120);
  if (!raw) return null;
  const text = raw.toLowerCase().replace(/\s+/g, ' ');
  if (text.length <= 1 || STOPWORDS.includes(text)) return null;
  return {
    raw,
    text,
    slug: text.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    terms: text.split(' ').filter((term) => term && !STOPWORDS.includes(term)),
  };
}

/**
 * Anchor id for a sense heading. Same rule as `senseAnchorId` in
 * packages/shared, repeated here because Convex functions bundle on their own.
 */
function senseAnchorId(senseKey: string): string {
  return `sense-${senseKey.replace(/[^a-zA-Z0-9-]+/g, '-')}`;
}

/** Marks the first matched span with the << >> delimiters the web app renders. */
function highlight(text: string, query: NormalizedQuery): string | null {
  if (!text) return null;
  const haystack = text.toLowerCase();
  let at = haystack.indexOf(query.text);
  let length = query.text.length;
  if (at < 0) {
    for (const term of query.terms) {
      const found = haystack.indexOf(term);
      if (found >= 0 && (at < 0 || found < at)) {
        at = found;
        length = term.length;
      }
    }
  }
  if (at < 0) return text.slice(0, SNIPPET_CHARS);
  let start = Math.max(0, at - SNIPPET_LEAD);
  if (start > 0) {
    // Snap to the next word so the snippet does not open mid-word.
    const gap = text.indexOf(' ', start);
    if (gap >= 0 && gap < at) start = gap + 1;
  }
  const window = text.slice(start, start + SNIPPET_CHARS);
  const local = at - start;
  if (local + length > window.length) return window;
  return `${window.slice(0, local)}<<${window.slice(local, local + length)}>>${window.slice(local + length)}`;
}

function bounded(page: number, pageSize: number) {
  return {
    page: Math.max(1, Math.min(10, Math.floor(page))),
    pageSize: Math.max(1, Math.min(50, Math.floor(pageSize))),
  };
}

/**
 * Glossary search. Exact and prefix title matches rank above alias and
 * expansion matches, which rank above full-text hits on the search document.
 */
export const search = query({
  args: {
    query: v.string(),
    entryType: entryTypeFilter,
    tagSlug: v.optional(v.union(v.string(), v.null())),
    page: v.number(),
    pageSize: v.number(),
  },
  handler: async (ctx, args): Promise<Page<SearchResult>> => {
    const { page, pageSize } = bounded(args.page, args.pageSize);
    const generation = await activeGeneration(ctx);
    const query = normalizeQuery(args.query);
    if (!generation || !query) return { results: [], total: 0, hasMore: false };
    const typeFilter = args.entryType ?? null;
    const tagSlug = args.tagSlug ?? null;

    const candidates = new Map<string, Doc<'entries'>>();
    const addRows = (rows: Doc<'entries'>[]) => {
      for (const row of rows) {
        if (!candidates.has(row.key)) candidates.set(row.key, row);
      }
    };

    for (const type of typeFilter
      ? [typeFilter]
      : (['TERM', 'ACRONYM'] as const)) {
      addRows(
        await ctx.db
          .query('entries')
          .withIndex('by_syncVersion_and_entryType_and_normalizedTitle', (i) =>
            i
              .eq('syncVersion', generation.version)
              .eq('entryType', type)
              .gte('normalizedTitle', query.text)
              .lt('normalizedTitle', `${query.text}￿`),
          )
          .take(CANDIDATE_CAP),
      );
      if (!query.slug) continue;
      const bySlug = await ctx.db
        .query('entries')
        .withIndex('by_syncVersion_and_entryType_and_slug', (i) =>
          i
            .eq('syncVersion', generation.version)
            .eq('entryType', type)
            .eq('slug', query.slug),
        )
        .unique();
      if (bySlug) addRows([bySlug]);
    }
    addRows(
      await ctx.db
        .query('entries')
        .withSearchIndex('search_searchDocument', (search) => {
          const active = search
            .search('searchDocument', query.raw)
            .eq('syncVersion', generation.version);
          return typeFilter ? active.eq('entryType', typeFilter) : active;
        })
        .take(CANDIDATE_CAP),
    );
    // A tag filter narrows to a small slice of the corpus, so the tagged
    // entries are candidates in their own right rather than a post-filter.
    if (tagSlug) {
      const links = await ctx.db
        .query('entryTags')
        .withIndex('by_syncVersion_and_tagSlug_and_updatedAt', (i) =>
          i.eq('syncVersion', generation.version).eq('tagSlug', tagSlug),
        )
        .order('desc')
        .take(CANDIDATE_CAP);
      for (const link of links) {
        const entry = await ctx.db.get(link.entryId);
        if (entry?.syncVersion === generation.version) addRows([entry]);
      }
    }

    const matches: Array<SearchResult & { bucket: number; score: number }> = [];
    for (const entry of candidates.values()) {
      if (typeFilter && entry.entryType !== typeFilter) continue;
      if (tagSlug && !entry.tagSlugs.includes(tagSlug)) continue;
      const title = entry.normalizedTitle;
      const document = entry.searchDocument.toLowerCase();
      let bucket = 0;
      let score = 0;
      if (title === query.text || entry.slug === query.slug) {
        bucket = 1;
        score = 1000;
      } else if (
        title.startsWith(query.text) ||
        (query.slug !== '' && entry.slug.startsWith(query.slug))
      ) {
        bucket = 2;
        score = 800;
      } else if (entry.matchTerms.includes(query.text)) {
        bucket = 3;
        score = 600;
      } else if (entry.matchTerms.some((term) => term.startsWith(query.text))) {
        bucket = 3;
        score = 500;
      } else if (
        document.includes(query.text) ||
        (query.terms.length > 0 &&
          query.terms.every((term) => document.includes(term)))
      ) {
        bucket = 4;
        score = 400;
      } else {
        continue;
      }
      matches.push({
        key: entry.key,
        entryType: entry.entryType,
        title: entry.title,
        slug: entry.slug,
        summaryText: entry.summaryText ?? null,
        snippet: highlight(entry.snippetText, query),
        senseCount: entry.senseCount,
        senseSummary: entry.senseSummary ?? null,
        bucket,
        score,
      });
    }
    matches.sort(
      (left, right) =>
        left.bucket - right.bucket ||
        right.score - left.score ||
        left.title.localeCompare(right.title),
    );
    return {
      results: matches
        .slice((page - 1) * pageSize, page * pageSize)
        .map(({ bucket: _bucket, score: _score, ...result }) => result),
      total: matches.length,
      hasMore: matches.length > page * pageSize,
    };
  },
});

/**
 * Meaning-level search: one result per sense, linking to the sense anchor on
 * the entry page. Senses whose label or expansion matches rank first.
 */
export const senses = query({
  args: {
    query: v.string(),
    entryType: entryTypeFilter,
    page: v.number(),
    pageSize: v.number(),
  },
  handler: async (ctx, args): Promise<Page<SenseResult>> => {
    const { page, pageSize } = bounded(args.page, args.pageSize);
    const generation = await activeGeneration(ctx);
    const query = normalizeQuery(args.query);
    if (!generation || !query) return { results: [], total: 0, hasMore: false };
    const typeFilter = args.entryType ?? null;

    const rows = await ctx.db
      .query('senses')
      .withSearchIndex('search_definition', (search) => {
        const active = search
          .search('definitionText', query.raw)
          .eq('syncVersion', generation.version);
        return typeFilter ? active.eq('entryType', typeFilter) : active;
      })
      .take(CANDIDATE_CAP);
    const ranked = rows
      .map((sense, index) => ({
        sense,
        index,
        rank:
          sense.normalizedLabel === query.text
            ? 0
            : sense.normalizedLabel.startsWith(query.text)
              ? 1
              : 2,
      }))
      .sort(
        (left, right) => left.rank - right.rank || left.index - right.index,
      );

    const results: SenseResult[] = [];
    for (const { sense } of ranked.slice(
      (page - 1) * pageSize,
      page * pageSize,
    )) {
      const entry = await ctx.db.get(sense.entryId);
      if (entry?.syncVersion !== generation.version) continue;
      results.push({
        entryType: sense.entryType,
        slug: entry.slug,
        title: entry.title,
        senseKey: sense.key,
        anchor: senseAnchorId(sense.key),
        label: sense.label ?? null,
        expandedForm: sense.expandedForm ?? null,
        labelFallback: sense.labelFallback,
        // citations already lists the primary source first, then each
        // further source that attests to this meaning.
        sourceNames: [
          ...new Set(sense.citations.map((citation) => citation.sourceName)),
        ],
        snippet: highlight(sense.definitionText, query),
      });
    }
    return {
      results,
      total: ranked.length,
      hasMore: ranked.length > page * pageSize,
    };
  },
});
