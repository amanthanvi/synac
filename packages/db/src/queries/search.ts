import { Prisma } from '@prisma/client';
import type { EntryType, PrismaClient } from '@prisma/client';

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

type SearchInput = {
  query: string;
  entryType?: EntryType;
  tagSlug?: string;
  page: number;
  pageSize: number;
};

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

const ignoredQueries = new Set(['a', 'an', 'and', 'or', 'the']);

function slugCandidate(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function searchPublishedEntries(
  db: PrismaClient,
  input: SearchInput,
): Promise<SearchResult[]> {
  const query = input.query.trim();
  if (!query) return [];

  const page = Math.max(1, Math.floor(input.page));
  const pageSize = Math.min(100, Math.max(1, Math.floor(input.pageSize)));
  const offset = (page - 1) * pageSize;

  const qNorm = normalizeQuery(query);
  if (qNorm.length <= 1 || ignoredQueries.has(qNorm)) return [];
  const qSlug = slugCandidate(query);
  const qLower = query.toLowerCase();

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

  const exactPrefixCandidates = await db.$queryRaw<Array<{ entryId: string }>>(
    Prisma.sql`
      SELECT DISTINCT es.entry_id AS "entryId"
      FROM entry_search es
      JOIN entries e ON e.id = es.entry_id
      WHERE (
        es.normalized_title = ${qNorm}
        OR lower(e.display_title) = ${qLower}
        OR es.primary_slug = ${qSlug}
        OR es.normalized_title LIKE ${qNorm + '%'}
        OR es.primary_slug LIKE ${qSlug + '%'}
      )
      ${entryTypeFilter}
      ${tagFilter}
      LIMIT 10
    `,
  );

  const enableFuzzy = qNorm.length >= 4 && exactPrefixCandidates.length < 10;

  const fuzzyCte = enableFuzzy
    ? Prisma.sql`
        , fuzzy AS (
          SELECT es.entry_id, 4 AS bucket, (200 + 100 * similarity(es.normalized_title, ${qNorm}))::float8 AS score
          FROM entry_search es
          WHERE es.normalized_title % ${qNorm}
          ${entryTypeFilter}
          ${tagFilter}
        )
      `
    : Prisma.empty;

  const fuzzyUnion = enableFuzzy ? Prisma.sql`UNION ALL SELECT * FROM fuzzy` : Prisma.empty;

  return db.$queryRaw<SearchResult[]>(
    Prisma.sql`
      WITH
      exact AS (
        SELECT es.entry_id, 1 AS bucket, 1000::float8 AS score
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
        SELECT es.entry_id, 2 AS bucket, 800::float8 AS score
        FROM entry_search es
        WHERE (
          es.normalized_title LIKE ${qNorm + '%'}
          OR es.primary_slug LIKE ${qSlug + '%'}
        )
        ${entryTypeFilter}
        ${tagFilter}
      ),
      fts AS (
        SELECT
          es.entry_id,
          3 AS bucket,
          (400 + 100 * ts_rank_cd(
            to_tsvector('english', es.search_document),
            websearch_to_tsquery('english', ${query})
          ))::float8 AS score
        FROM entry_search es
        WHERE to_tsvector('english', es.search_document) @@ websearch_to_tsquery('english', ${query})
        ${entryTypeFilter}
        ${tagFilter}
      )
      ${fuzzyCte}
      ,
      combined AS (
        SELECT * FROM exact
        UNION ALL SELECT * FROM prefix
        UNION ALL SELECT * FROM fts
        ${fuzzyUnion}
      ),
      best AS (
        SELECT DISTINCT ON (entry_id) entry_id, bucket, score
        FROM combined
        ORDER BY entry_id, bucket ASC, score DESC
      )
      SELECT
        e.id AS "id",
        e.entry_type AS "entryType",
        e.display_title AS "displayTitle",
        e.primary_slug AS "primarySlug",
        e.summary_text AS "summaryText",
        ts_headline(
          'english',
          es.search_document,
          websearch_to_tsquery('english', ${query}),
          'StartSel=<<, StopSel=>>, MaxWords=24, MinWords=10'
        ) AS "snippet",
        CASE WHEN e.entry_type = 'ACRONYM' THEN (
          SELECT COUNT(*)::int
          FROM senses s
          WHERE s.entry_id = e.id
            AND s.deleted_at IS NULL
            AND s.status = 'PUBLISHED'
        ) ELSE NULL END AS "senseCount",
        CASE WHEN e.entry_type = 'ACRONYM' THEN (
          SELECT string_agg(x.val, ' · ' ORDER BY x.sense_order)
          FROM (
            SELECT
              s.sense_order,
              trim(coalesce(s.sense_label, s.expanded_form, '')) AS val
            FROM senses s
            WHERE s.entry_id = e.id
              AND s.deleted_at IS NULL
              AND s.status = 'PUBLISHED'
            ORDER BY s.sense_order ASC
            LIMIT 3
          ) x
          WHERE x.val <> ''
        ) ELSE NULL END AS "senseSummary",
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
