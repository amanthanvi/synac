// Meaning-level search over the trigger-maintained `sense_search` table.
import { Prisma } from '@prisma/client';

import type { DbClientLike } from '../client.js';
import { normalizeTitle } from '../text.js';
import { IGNORED_QUERIES, isUuid } from './searchShared.js';
import type { EntryType } from '@prisma/client';

export type SenseSearchResult = {
  senseId: string;
  entryId: string;
  entryType: EntryType;
  entrySlug: string;
  entryTitle: string;
  senseSlug: string | null;
  senseLabel: string | null;
  expandedForm: string | null;
  sourceNames: string | null;
  snippet: string | null;
  bucket: number;
  score: number;
  /** Public URL for the meaning, e.g. `/acronym/soc#s-security-operations-center`. */
  url: string;
};

export type SenseSearchPage = {
  items: SenseSearchResult[];
  total: number;
};

export type SenseSearchInput = {
  query: string;
  entryType?: EntryType;
  page: number;
  pageSize: number;
};

export type SenseSearchCoverage = {
  publishedSenses: number;
  indexedSenses: number;
  missingSenseIds: string[];
  orphanedSenseIds: string[];
};

/** 1 exact label · 2 label prefix · 3 full-text · 4 trigram fuzzy. */
export const SENSE_SEARCH_BUCKET = {
  EXACT: 1,
  PREFIX: 2,
  FTS: 3,
  FUZZY: 4,
} as const;

const FUZZY_MIN_QUERY_LENGTH = 4;
const FUZZY_SUPPRESSION_THRESHOLD = 10;

export function senseUrl(input: {
  entryType: EntryType;
  entrySlug: string;
  senseSlug: string | null;
}): string {
  const base = input.entryType === 'ACRONYM' ? '/acronym' : '/term';
  const path = `${base}/${input.entrySlug}`;
  return input.senseSlug ? `${path}#s-${input.senseSlug}` : path;
}

type SenseSearchRow = Omit<SenseSearchResult, 'url'>;

/**
 * Bucket pipeline over `sense_search`, ending in a `best` CTE of
 * `(sense_id, bucket, score)` deduplicated to the best bucket per sense.
 * The fuzzy bucket is gated inside SQL so search stays a single round trip.
 */
function buildSenseSearchCtes(input: {
  query: string;
  qNorm: string;
  entryType?: EntryType;
}): Prisma.Sql {
  const { query, qNorm } = input;
  const qPrefix = `${qNorm}%`;

  const entryTypeFilter = input.entryType
    ? Prisma.sql`AND ss.entry_type = ${input.entryType}::"EntryType"`
    : Prisma.empty;

  return Prisma.sql`
    exact AS (
      SELECT ss.sense_id, ${SENSE_SEARCH_BUCKET.EXACT}::int AS bucket, 1000::float8 AS score
      FROM sense_search ss
      WHERE (
        ss.normalized_label = ${qNorm}
        OR lower(trim(ss.sense_label)) = ${qNorm}
        OR lower(trim(ss.expanded_form)) = ${qNorm}
        OR lower(trim(ss.entry_title)) = ${qNorm}
      )
      ${entryTypeFilter}
    ),
    prefix AS (
      SELECT ss.sense_id, ${SENSE_SEARCH_BUCKET.PREFIX}::int AS bucket, 800::float8 AS score
      FROM sense_search ss
      WHERE (
        ss.normalized_label LIKE ${qPrefix}
        OR lower(trim(ss.sense_label)) LIKE ${qPrefix}
        OR lower(trim(ss.expanded_form)) LIKE ${qPrefix}
        OR lower(trim(ss.entry_title)) LIKE ${qPrefix}
      )
      ${entryTypeFilter}
    ),
    fts AS (
      SELECT
        ss.sense_id,
        ${SENSE_SEARCH_BUCKET.FTS}::int AS bucket,
        (400 + 100 * ts_rank_cd(
          to_tsvector('english', ss.search_document),
          websearch_to_tsquery('english', ${query})
        ))::float8 AS score
      FROM sense_search ss
      WHERE to_tsvector('english', ss.search_document) @@ websearch_to_tsquery('english', ${query})
      ${entryTypeFilter}
    ),
    exact_prefix_union AS (
      SELECT sense_id FROM exact
      UNION
      SELECT sense_id FROM prefix
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
        ss.sense_id,
        ${SENSE_SEARCH_BUCKET.FUZZY}::int AS bucket,
        (200 + 100 * similarity(ss.normalized_label, ${qNorm}))::float8 AS score
      FROM sense_search ss
      WHERE (SELECT enabled FROM fuzzy_enabled)
        AND ss.normalized_label % ${qNorm}
      ${entryTypeFilter}
    ),
    combined AS (
      SELECT * FROM exact
      UNION ALL SELECT * FROM prefix
      UNION ALL SELECT * FROM fts
      UNION ALL SELECT * FROM fuzzy
    ),
    best AS (
      SELECT DISTINCT ON (sense_id) sense_id, bucket, score
      FROM combined
      ORDER BY sense_id, bucket ASC, score DESC
    )
  `;
}

export async function searchPublishedSenses(
  db: DbClientLike,
  input: SenseSearchInput,
): Promise<SenseSearchPage> {
  const query = input.query.trim();
  if (!query) return { items: [], total: 0 };

  const qNorm = normalizeTitle(query);
  if (qNorm.length <= 1 || IGNORED_QUERIES.has(qNorm))
    return { items: [], total: 0 };

  const page = Math.max(1, Math.floor(input.page));
  const pageSize = Math.min(100, Math.max(1, Math.floor(input.pageSize)));
  const offset = (page - 1) * pageSize;

  const ctes = buildSenseSearchCtes({
    query,
    qNorm,
    entryType: input.entryType,
  });

  const [rows, totals] = await Promise.all([
    db.$queryRaw<SenseSearchRow[]>(Prisma.sql`
      WITH ${ctes}
      SELECT
        ss.sense_id AS "senseId",
        ss.entry_id AS "entryId",
        ss.entry_type AS "entryType",
        ss.entry_slug AS "entrySlug",
        ss.entry_title AS "entryTitle",
        ss.sense_slug AS "senseSlug",
        ss.sense_label AS "senseLabel",
        ss.expanded_form AS "expandedForm",
        ss.source_names AS "sourceNames",
        ts_headline(
          'english',
          ss.search_document,
          websearch_to_tsquery('english', ${query}),
          'StartSel=<<, StopSel=>>, MaxWords=24, MinWords=10'
        ) AS "snippet",
        best.bucket AS "bucket",
        best.score AS "score"
      FROM best
      JOIN sense_search ss ON ss.sense_id = best.sense_id
      ORDER BY best.bucket ASC, best.score DESC, ss.entry_title ASC, ss.sense_id ASC
      LIMIT ${pageSize} OFFSET ${offset}
    `),
    db.$queryRaw<Array<{ total: number }>>(Prisma.sql`
      WITH ${ctes}
      SELECT COUNT(*)::int AS "total" FROM best
    `),
  ]);

  return {
    items: rows.map((row) => ({
      ...row,
      url: senseUrl({
        entryType: row.entryType,
        entrySlug: row.entrySlug,
        senseSlug: row.senseSlug,
      }),
    })),
    total: totals[0]?.total ?? 0,
  };
}

/**
 * Re-runs the SQL refresh functions that maintain `sense_search`.
 * With `entryIds`, only those entries' senses are refreshed.
 */
export async function rebuildSenseSearchIndex(
  db: DbClientLike,
  input?: { entryIds?: string[] },
): Promise<{ rebuiltCount: number }> {
  const rawEntryIds = input?.entryIds;

  if (rawEntryIds !== undefined) {
    const requestedIds = rawEntryIds.map((id) => id.trim()).filter(isUuid);
    if (requestedIds.length === 0) return { rebuiltCount: 0 };

    const idList = Prisma.join(
      requestedIds.map((id) => Prisma.sql`${id}::uuid`),
    );

    await db.$executeRaw(Prisma.sql`
      SELECT synac_refresh_sense_search_for_entry(e.id)
      FROM entries e
      WHERE e.id IN (${idList})
    `);

    const rows = await db.$queryRaw<Array<{ total: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS "total"
      FROM sense_search ss
      WHERE ss.entry_id IN (${idList})
    `);

    return { rebuiltCount: rows[0]?.total ?? 0 };
  }

  await db.$executeRaw(Prisma.sql`
    DELETE FROM sense_search ss
    WHERE NOT EXISTS (
      SELECT 1
      FROM senses s
      JOIN entries e ON e.id = s.entry_id
      WHERE s.id = ss.sense_id
        AND s.deleted_at IS NULL
        AND s.status = 'PUBLISHED'
        AND e.deleted_at IS NULL
        AND e.status = 'PUBLISHED'
    )
  `);

  await db.$executeRaw(
    Prisma.sql`SELECT synac_refresh_sense_search(s.id) FROM senses s`,
  );

  const rows = await db.$queryRaw<Array<{ total: number }>>(Prisma.sql`
    SELECT COUNT(*)::int AS "total" FROM sense_search
  `);

  return { rebuiltCount: rows[0]?.total ?? 0 };
}

export async function getSenseSearchCoverage(
  db: DbClientLike,
  input?: { limit?: number },
): Promise<SenseSearchCoverage> {
  const limit = Math.max(1, Math.min(500, Math.floor(input?.limit ?? 100)));

  const [publishedSenses, indexedSenses, missingRows, orphanedRows] =
    await Promise.all([
      db.sense.count({
        where: {
          status: 'PUBLISHED',
          deletedAt: null,
          entry: { status: 'PUBLISHED', deletedAt: null },
        },
      }),
      db.senseSearch.count(),
      db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT s.id
      FROM senses s
      JOIN entries e ON e.id = s.entry_id
      LEFT JOIN sense_search ss ON ss.sense_id = s.id
      WHERE s.status = 'PUBLISHED'
        AND s.deleted_at IS NULL
        AND e.status = 'PUBLISHED'
        AND e.deleted_at IS NULL
        AND ss.sense_id IS NULL
      ORDER BY s.updated_at DESC
      LIMIT ${limit}
    `),
      db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT ss.sense_id AS id
      FROM sense_search ss
      LEFT JOIN senses s ON s.id = ss.sense_id
      LEFT JOIN entries e ON e.id = s.entry_id
      WHERE s.id IS NULL
         OR s.deleted_at IS NOT NULL
         OR s.status <> 'PUBLISHED'
         OR e.id IS NULL
         OR e.deleted_at IS NOT NULL
         OR e.status <> 'PUBLISHED'
      ORDER BY ss.updated_at DESC
      LIMIT ${limit}
    `),
    ]);

  return {
    publishedSenses,
    indexedSenses,
    missingSenseIds: missingRows.map((row) => row.id),
    orphanedSenseIds: orphanedRows.map((row) => row.id),
  };
}
