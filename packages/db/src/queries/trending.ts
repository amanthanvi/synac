import { Prisma } from '@prisma/client';
import type { EntryType, PrismaClient } from '@prisma/client';

export type TrendingEntry = {
  id: string;
  entryType: EntryType;
  displayTitle: string;
  primarySlug: string;
  summaryText: string | null;
  views: number;
};

export async function listTrendingEntries(
  db: PrismaClient,
  input: { windowDays: number; limit: number },
): Promise<TrendingEntry[]> {
  const windowDays = Math.max(1, Math.min(30, Math.floor(input.windowDays)));
  const limit = Math.max(1, Math.min(200, Math.floor(input.limit)));

  return db.$queryRaw<TrendingEntry[]>(
    Prisma.sql`
      SELECT
        e.id AS "id",
        e.entry_type AS "entryType",
        e.display_title AS "displayTitle",
        e.primary_slug AS "primarySlug",
        e.summary_text AS "summaryText",
        COUNT(ev.id)::int AS "views"
      FROM entry_views ev
      JOIN entries e ON e.id = ev.entry_id
      WHERE ev.last_seen_at >= NOW() - (${windowDays}::text || ' days')::interval
        AND e.status = 'PUBLISHED'
        AND e.deleted_at IS NULL
      GROUP BY e.id
      ORDER BY "views" DESC, e.display_title ASC
      LIMIT ${limit}
    `,
  );
}

