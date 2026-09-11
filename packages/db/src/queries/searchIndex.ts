import { Prisma } from '@prisma/client';

import { rebuildSenseSearchIndex } from './senseSearch.js';
import { isUuid } from './searchShared.js';

import type { DbClientLike } from '../client.js';

export type SearchIndexCoverage = {
  publishedEntries: number;
  indexedEntries: number;
  missingEntryIds: string[];
  orphanedEntryIds: string[];
};

export type SearchIndexRebuildResult = {
  rebuiltCount: number;
  senseRebuiltCount: number;
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

  const [publishedEntries, indexedEntries, missingRows, orphanedRows] =
    await Promise.all([
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

/**
 * Refreshes `entry_search` (and the meaning-level `sense_search`) from the
 * canonical tables. The refresh statement itself reports how many published
 * entries it touched, so there is no separate counting scan.
 */
export async function rebuildSearchIndex(
  db: DbClientLike,
  input?: { entryIds?: string[] },
): Promise<SearchIndexRebuildResult> {
  const rawEntryIds = input?.entryIds;
  const partialRebuildRequested = rawEntryIds !== undefined;

  const requestedIds = (rawEntryIds ?? [])
    .map((entryId) => entryId.trim())
    .filter(isUuid);

  if (partialRebuildRequested) {
    if (requestedIds.length === 0) {
      return { rebuiltCount: 0, senseRebuiltCount: 0 };
    }

    await deleteOrphanedSearchIndexRows(db, { entryIds: requestedIds });

    const rebuiltCount = await db.$executeRaw(Prisma.sql`
      SELECT synac_refresh_entry_search(id)
      FROM entries
      WHERE status = 'PUBLISHED'
        AND deleted_at IS NULL
        AND id IN (${entryIdSqlList(requestedIds)})
    `);

    const senses = await rebuildSenseSearchIndex(db, {
      entryIds: requestedIds,
    });

    return {
      rebuiltCount: Math.max(0, rebuiltCount),
      senseRebuiltCount: senses.rebuiltCount,
    };
  }

  await deleteOrphanedSearchIndexRows(db);

  const rebuiltCount = await db.$executeRaw(Prisma.sql`
    SELECT synac_refresh_entry_search(id)
    FROM entries
    WHERE status = 'PUBLISHED'
      AND deleted_at IS NULL
  `);

  const senses = await rebuildSenseSearchIndex(db);

  return {
    rebuiltCount: Math.max(0, rebuiltCount),
    senseRebuiltCount: senses.rebuiltCount,
  };
}
