import { Prisma } from '@prisma/client';

import type { DbClientLike } from '../client.js';

export type SearchIndexCoverage = {
  publishedEntries: number;
  indexedEntries: number;
  missingEntryIds: string[];
  orphanedEntryIds: string[];
};

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
  const entryIds = (input?.entryIds ?? []).map((entryId) => entryId.trim()).filter(Boolean);

  if (entryIds.length > 0) {
    await db.$executeRaw(Prisma.sql`
      SELECT synac_refresh_entry_search(id)
      FROM entries
      WHERE id IN (${Prisma.join(entryIds.map((entryId) => Prisma.sql`${entryId}::uuid`))})
    `);

    return { rebuiltCount: entryIds.length };
  }

  const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM entries
    WHERE deleted_at IS NULL
  `);

  await db.$executeRaw(Prisma.sql`
    SELECT synac_refresh_entry_search(id)
    FROM entries
    WHERE deleted_at IS NULL
  `);

  return { rebuiltCount: rows.length };
}
