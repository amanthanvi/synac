import { Prisma } from '@prisma/client';

import type { DbClientLike } from '../client.js';

/** Matches canonical UUID strings (parameterized as `::uuid` in raw SQL). */
const UUID_STRING_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSearchIndexEntryId(value: string): boolean {
  return UUID_STRING_RE.test(value.trim());
}

export type SearchIndexCoverage = {
  publishedEntries: number;
  indexedEntries: number;
  missingEntryIds: string[];
  orphanedEntryIds: string[];
};

function entryIdSqlList(entryIds: string[]): Prisma.Sql {
  return Prisma.join(entryIds.map((id) => Prisma.sql`${id}::uuid`));
}

async function deleteOrphanedSearchIndexRows(
  db: DbClientLike,
  input?: { entryIds?: string[] },
): Promise<void> {
  const requestedIds = input?.entryIds;
  const requestedFilter =
    requestedIds && requestedIds.length > 0
      ? Prisma.sql`AND es.entry_id IN (${entryIdSqlList(requestedIds)})`
      : Prisma.empty;

  await db.$executeRaw(Prisma.sql`
    DELETE FROM entry_search es
    WHERE NOT EXISTS (
      SELECT 1
      FROM entries e
      WHERE e.id = es.entry_id
        AND e.status = 'PUBLISHED'
        AND e.deleted_at IS NULL
    )
    ${requestedFilter}
  `);
}

export async function getSearchIndexCoverage(
  db: DbClientLike,
  input?: { limit?: number },
): Promise<SearchIndexCoverage> {
  const limit = Math.max(1, Math.min(500, Math.floor(input?.limit ?? 100)));

  const [publishedEntries, indexedEntries, missingRows, orphanedRows] = await Promise.all([
    db.entry.count({ where: { status: 'PUBLISHED', deletedAt: null } }),
    db.entrySearch.count(),
    db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT e.id
      FROM entries e
      LEFT JOIN entry_search es ON es.entry_id = e.id
      WHERE e.status = 'PUBLISHED'
        AND e.deleted_at IS NULL
        AND es.entry_id IS NULL
      ORDER BY e.updated_at DESC
      LIMIT ${limit}
    `),
    db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT es.entry_id AS id
      FROM entry_search es
      LEFT JOIN entries e ON e.id = es.entry_id
      WHERE e.id IS NULL
         OR e.deleted_at IS NOT NULL
         OR e.status <> 'PUBLISHED'
      ORDER BY es.updated_at DESC
      LIMIT ${limit}
    `),
  ]);

  return {
    publishedEntries,
    indexedEntries,
    missingEntryIds: missingRows.map((row) => row.id),
    orphanedEntryIds: orphanedRows.map((row) => row.id),
  };
}

export async function rebuildSearchIndex(
  db: DbClientLike,
  input?: { entryIds?: string[] },
): Promise<{ rebuiltCount: number }> {
  const rawEntryIds = input?.entryIds;
  const partialRebuildRequested = rawEntryIds !== undefined;

  const requestedIds = (rawEntryIds ?? [])
    .map((entryId) => entryId.trim())
    .filter(Boolean)
    .filter(isSearchIndexEntryId);

  if (partialRebuildRequested) {
    if (requestedIds.length === 0) {
      return { rebuiltCount: 0 };
    }
  }

  if (requestedIds.length > 0) {
    await deleteOrphanedSearchIndexRows(db, { entryIds: requestedIds });

    const matchedRows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id
      FROM entries
      WHERE status = 'PUBLISHED'
        AND deleted_at IS NULL
        AND id IN (${entryIdSqlList(requestedIds)})
    `);

    if (matchedRows.length === 0) {
      return { rebuiltCount: 0 };
    }

    await db.$executeRaw(Prisma.sql`
      SELECT synac_refresh_entry_search(id)
      FROM entries
      WHERE status = 'PUBLISHED'
        AND deleted_at IS NULL
        AND id IN (${entryIdSqlList(matchedRows.map((row) => row.id))})
    `);

    return { rebuiltCount: matchedRows.length };
  }

  await deleteOrphanedSearchIndexRows(db);

  const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM entries
    WHERE status = 'PUBLISHED'
      AND deleted_at IS NULL
  `);

  await db.$executeRaw(Prisma.sql`
    SELECT synac_refresh_entry_search(id)
    FROM entries
    WHERE status = 'PUBLISHED'
      AND deleted_at IS NULL
  `);

  return { rebuiltCount: rows.length };
}
