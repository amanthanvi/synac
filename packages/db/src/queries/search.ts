import { Prisma } from '@prisma/client';

import type { DbClientLike } from '../client.js';
import { normalizeTitle, slugify } from '../text.js';
import { IGNORED_QUERIES } from './searchShared.js';
import type { EntryType } from '@prisma/client';

export type SearchResult = {
  id: string;
  entryType: EntryType;
  displayTitle: string;
  primarySlug: string;
  summaryText: string | null;
  snippet: string | null;
  senseCount: number | null;
  senseSummary: string | null;
  bucket: number;
  score: number;
};

export type SearchInput = {
  query: string;
  entryType?: EntryType;
  tagSlug?: string;
  page: number;
  pageSize: number;
};

/** `searchPublishedEntries` results plus the total match count for the same filters. */
export type SearchPage = {
  items: SearchResult[];
  total: number;
};

/**
 * Ranking buckets. Lower wins, so a fuzzy hit can never outrank an exact one.
 *
 * 1 exact title/slug · 2 title/slug prefix · 3 expansion/variant exact ·
 * 4 expansion/variant prefix · 5 full-text · 6 trigram fuzzy.
 */
export const SEARCH_BUCKET = {
  EXACT: 1,
  PREFIX: 2,
  EXPANSION_EXACT: 3,
  EXPANSION_PREFIX: 4,
  FTS: 5,
  FUZZY: 6,
} as const;

/** Minimum query length before trigram fuzzy matching is worth the scan. */
const FUZZY_MIN_QUERY_LENGTH = 4;

/** If this many exact/prefix/expansion candidates already exist, skip fuzzy entirely. */
const FUZZY_SUPPRESSION_THRESHOLD = 10;

/** Minimum trigram similarity for `suggestSearchCorrection` to offer a "did you mean". */
const SUGGESTION_MIN_SIMILARITY = 0.3;

type NormalizedQuery = {
  query: string;
  qNorm: string;
  qSlug: string;
  qLower: string;
  qPrefix: string;
  qSlugPrefix: string;
};

function normalizeSearchInput(rawQuery: string): NormalizedQuery | null {
  const query = rawQuery.trim();
  if (!query) return null;

  const qNorm = normalizeTitle(query);
  if (qNorm.length <= 1 || IGNORED_QUERIES.has(qNorm)) return null;

  const qSlug = slugify(query);

  return {
    query,
    qNorm,
    qSlug,
    qLower: query.toLowerCase(),
    qPrefix: `${qNorm}%`,
    qSlugPrefix: `${qSlug}%`,
  };
}

function buildFilters(input: { entryType?: EntryType; tagSlug?: string }): {
  entryTypeFilter: Prisma.Sql;
  tagFilter: Prisma.Sql;
} {
  const entryTypeFilter = input.entryType
    ? Prisma.sql`AND es.entry_type = ${input.entryType}::"EntryType"`
    : Prisma.empty;

  const tagFilter = input.tagSlug
    ? Prisma.sql`
        AND EXISTS (
          SELECT 1
          FROM entry_tags et
          JOIN tags t ON t.id = et.tag_id
          WHERE et.entry_id = es.entry_id
            AND t.deleted_at IS NULL
            AND t.slug = ${input.tagSlug}
        )
      `
    : Prisma.empty;

  return { entryTypeFilter, tagFilter };
}

/**
 * The full bucket pipeline as a single `WITH` list, ending in a `best` CTE of
 * `(entry_id, bucket, score)` rows deduplicated to the best bucket per entry.
 *
 * The fuzzy bucket is gated inside SQL (candidate count + query length) so the
 * whole search is one round trip instead of a pre-probe followed by a query.
 */
function buildSearchCtes(
  normalized: NormalizedQuery,
  filters: { entryTypeFilter: Prisma.Sql; tagFilter: Prisma.Sql },
): Prisma.Sql {
  const { entryTypeFilter, tagFilter } = filters;
  const { query, qNorm, qSlug, qLower, qPrefix, qSlugPrefix } = normalized;

  return Prisma.sql`
    exact AS (
      SELECT es.entry_id, ${SEARCH_BUCKET.EXACT}::int AS bucket, 1000::float8 AS score
      FROM entry_search es
      JOIN entries e ON e.id = es.entry_id
      WHERE (
        es.normalized_title = ${qNorm}
        OR lower(e.display_title) = ${qLower}
        OR es.primary_slug = ${qSlug}
      )
      ${entryTypeFilter}
      ${tagFilter}
    ),
    prefix AS (
      SELECT es.entry_id, ${SEARCH_BUCKET.PREFIX}::int AS bucket, 800::float8 AS score
      FROM entry_search es
      WHERE (
        es.normalized_title LIKE ${qPrefix}
        OR es.primary_slug LIKE ${qSlugPrefix}
      )
      ${entryTypeFilter}
      ${tagFilter}
    ),
    expansion_exact AS (
      SELECT es.entry_id, ${SEARCH_BUCKET.EXPANSION_EXACT}::int AS bucket, 700::float8 AS score
      FROM entry_search es
      WHERE (
        EXISTS (
          SELECT 1
          FROM senses s
          WHERE s.entry_id = es.entry_id
            AND s.deleted_at IS NULL
            AND s.status = 'PUBLISHED'
            AND lower(trim(s.expanded_form)) = ${qNorm}
        )
        OR EXISTS (
          SELECT 1
          FROM entry_variants ev
          WHERE ev.entry_id = es.entry_id
            AND lower(trim(ev.normalized_variant)) = ${qNorm}
        )
      )
      ${entryTypeFilter}
      ${tagFilter}
    ),
    expansion_prefix AS (
      SELECT es.entry_id, ${SEARCH_BUCKET.EXPANSION_PREFIX}::int AS bucket, 600::float8 AS score
      FROM entry_search es
      WHERE (
        EXISTS (
          SELECT 1
          FROM senses s
          WHERE s.entry_id = es.entry_id
            AND s.deleted_at IS NULL
            AND s.status = 'PUBLISHED'
            AND lower(trim(s.expanded_form)) LIKE ${qPrefix}
        )
        OR EXISTS (
          SELECT 1
          FROM entry_variants ev
          WHERE ev.entry_id = es.entry_id
            AND lower(trim(ev.normalized_variant)) LIKE ${qPrefix}
        )
      )
      ${entryTypeFilter}
      ${tagFilter}
    ),
    fts AS (
      SELECT
        es.entry_id,
        ${SEARCH_BUCKET.FTS}::int AS bucket,
        (400 + 100 * ts_rank_cd(
          to_tsvector('english', es.search_document),
          websearch_to_tsquery('english', ${query})
        ))::float8 AS score
      FROM entry_search es
      WHERE to_tsvector('english', es.search_document) @@ websearch_to_tsquery('english', ${query})
      ${entryTypeFilter}
      ${tagFilter}
    ),
    exact_prefix_union AS (
      SELECT entry_id FROM exact
      UNION
      SELECT entry_id FROM prefix
      UNION
      SELECT entry_id FROM expansion_exact
      UNION
      SELECT entry_id FROM expansion_prefix
    ),
    fuzzy_enabled AS (
      SELECT (
        length(${qNorm}) >= ${FUZZY_MIN_QUERY_LENGTH}::int
        AND (
          SELECT count(*)
          FROM (SELECT 1 FROM exact_prefix_union LIMIT ${FUZZY_SUPPRESSION_THRESHOLD}::int) probe
        ) < ${FUZZY_SUPPRESSION_THRESHOLD}::int
      ) AS enabled
    ),
    fuzzy AS (
      SELECT
        es.entry_id,
        ${SEARCH_BUCKET.FUZZY}::int AS bucket,
        (200 + 100 * similarity(es.normalized_title, ${qNorm}))::float8 AS score
      FROM entry_search es
      WHERE (SELECT enabled FROM fuzzy_enabled)
        AND es.normalized_title % ${qNorm}
      ${entryTypeFilter}
      ${tagFilter}
    ),
    combined AS (
      SELECT * FROM exact
      UNION ALL SELECT * FROM prefix
      UNION ALL SELECT * FROM expansion_exact
      UNION ALL SELECT * FROM expansion_prefix
      UNION ALL SELECT * FROM fts
      UNION ALL SELECT * FROM fuzzy
    ),
    best AS (
      SELECT DISTINCT ON (entry_id) entry_id, bucket, score
      FROM combined
      ORDER BY entry_id, bucket ASC, score DESC
    )
  `;
}

export async function searchPublishedEntries(
  db: DbClientLike,
  input: SearchInput,
): Promise<SearchResult[]> {
  const normalized = normalizeSearchInput(input.query);
  if (!normalized) return [];

  const page = Math.max(1, Math.floor(input.page));
  const pageSize = Math.min(100, Math.max(1, Math.floor(input.pageSize)));
  const offset = (page - 1) * pageSize;

  const ctes = buildSearchCtes(normalized, buildFilters(input));

  return db.$queryRaw<SearchResult[]>(
    Prisma.sql`
      WITH ${ctes}
      SELECT
        e.id AS "id",
        e.entry_type AS "entryType",
        e.display_title AS "displayTitle",
        e.primary_slug AS "primarySlug",
        e.summary_text AS "summaryText",
        ts_headline(
          'english',
          es.search_document,
          websearch_to_tsquery('english', ${normalized.query}),
          'StartSel=<<, StopSel=>>, MaxWords=24, MinWords=10'
        ) AS "snippet",
        (
          SELECT COUNT(*)::int
          FROM senses s
          WHERE s.entry_id = e.id
            AND s.deleted_at IS NULL
            AND s.status = 'PUBLISHED'
        ) AS "senseCount",
        (
          SELECT string_agg(x.val, ' · ' ORDER BY x.sense_order)
          FROM (
            SELECT
              s.sense_order,
              coalesce(
                nullif(trim(s.sense_label), ''),
                nullif(trim(s.expanded_form), ''),
                (
                  SELECT nullif(trim(src.name), '')
                  FROM sense_definitions sd
                  JOIN citations c ON c.id = sd.citation_id
                  JOIN sources src ON src.id = c.source_id
                  WHERE sd.sense_id = s.id
                  ORDER BY sd.is_primary DESC, src.name ASC
                  LIMIT 1
                ),
                ''
              ) AS val
            FROM senses s
            WHERE s.entry_id = e.id
              AND s.deleted_at IS NULL
              AND s.status = 'PUBLISHED'
            ORDER BY s.sense_order ASC
            LIMIT 3
          ) x
          WHERE x.val <> ''
        ) AS "senseSummary",
        best.bucket AS "bucket",
        best.score AS "score"
      FROM best
      JOIN entries e ON e.id = best.entry_id
      JOIN entry_search es ON es.entry_id = e.id
      ORDER BY best.bucket ASC, best.score DESC, e.display_title ASC
      LIMIT ${pageSize} OFFSET ${offset}
    `,
  );
}

/** Total distinct published entries matching the same filters, ignoring pagination. */
export async function countSearchResults(
  db: DbClientLike,
  input: Omit<SearchInput, 'page' | 'pageSize'> & {
    page?: number;
    pageSize?: number;
  },
): Promise<number> {
  const normalized = normalizeSearchInput(input.query);
  if (!normalized) return 0;

  const ctes = buildSearchCtes(normalized, buildFilters(input));

  const rows = await db.$queryRaw<Array<{ total: number }>>(
    Prisma.sql`
      WITH ${ctes}
      SELECT COUNT(*)::int AS "total" FROM best
    `,
  );

  return rows[0]?.total ?? 0;
}

/** One page of results plus the total count, for paginated search UIs. */
export async function searchPublishedEntriesPage(
  db: DbClientLike,
  input: SearchInput,
): Promise<SearchPage> {
  const [items, total] = await Promise.all([
    searchPublishedEntries(db, input),
    countSearchResults(db, input),
  ]);

  return { items, total };
}

/**
 * Closest indexed title by trigram similarity, for "did you mean" prompts.
 * Returns `null` when nothing is close enough or the best match is the query itself.
 */
export async function suggestSearchCorrection(
  db: DbClientLike,
  input: { query: string; entryType?: EntryType },
): Promise<string | null> {
  const normalized = normalizeSearchInput(input.query);
  if (!normalized) return null;

  const { qNorm } = normalized;

  const entryTypeFilter = input.entryType
    ? Prisma.sql`AND es.entry_type = ${input.entryType}::"EntryType"`
    : Prisma.empty;

  const rows = await db.$queryRaw<Array<{ suggestion: string; score: number }>>(
    Prisma.sql`
      SELECT
        es.normalized_title AS "suggestion",
        similarity(es.normalized_title, ${qNorm})::float8 AS "score"
      FROM entry_search es
      WHERE es.normalized_title <> ${qNorm}
        AND es.normalized_title % ${qNorm}
        AND similarity(es.normalized_title, ${qNorm}) > ${SUGGESTION_MIN_SIMILARITY}::float8
      ${entryTypeFilter}
      ORDER BY similarity(es.normalized_title, ${qNorm}) DESC, es.normalized_title ASC
      LIMIT 1
    `,
  );

  const best = rows[0];
  if (!best) return null;
  if (best.suggestion === qNorm) return null;

  return best.suggestion;
}
