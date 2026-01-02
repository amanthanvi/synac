import type { DbClientLike } from '../client.js';
import type { Prisma, RelationshipType } from '@prisma/client';

export type RelatedEntry = Prisma.EntryGetPayload<{
  select: { id: true; entryType: true; displayTitle: true; primarySlug: true };
}>;

export type RelationshipListItem = {
  relationshipType: RelationshipType;
  weight: number;
  isFrom: boolean;
  otherEntry: RelatedEntry;
};

export async function listPublishedRelationshipsForEntry(
  db: DbClientLike,
  input: { entryId: string; limit: number },
): Promise<RelationshipListItem[]> {
  const rows = await db.entryRelationship.findMany({
    where: {
      deletedAt: null,
      OR: [{ fromEntryId: input.entryId }, { toEntryId: input.entryId }],
      fromEntry: { deletedAt: null, status: 'PUBLISHED' },
      toEntry: { deletedAt: null, status: 'PUBLISHED' },
    },
    select: {
      fromEntryId: true,
      toEntryId: true,
      relationshipType: true,
      weight: true,
      fromEntry: {
        select: { id: true, entryType: true, displayTitle: true, primarySlug: true },
      },
      toEntry: {
        select: { id: true, entryType: true, displayTitle: true, primarySlug: true },
      },
    },
    orderBy: [{ weight: 'desc' }, { createdAt: 'desc' }],
    take: Math.min(500, Math.max(1, input.limit) * 3),
  });

  const bestByKey = new Map<string, RelationshipListItem>();

  for (const row of rows) {
    const isFrom = row.fromEntryId === input.entryId;
    const otherEntry = isFrom ? row.toEntry : row.fromEntry;

    if (otherEntry.id === input.entryId) continue;

    const key = `${row.relationshipType}:${otherEntry.id}`;
    const next: RelationshipListItem = {
      relationshipType: row.relationshipType,
      weight: row.weight,
      isFrom,
      otherEntry,
    };

    const existing = bestByKey.get(key);
    if (!existing || existing.weight < next.weight) {
      bestByKey.set(key, next);
    }
  }

  return Array.from(bestByKey.values())
    .sort((a, b) => {
      if (a.relationshipType !== b.relationshipType) {
        return a.relationshipType.localeCompare(b.relationshipType);
      }
      if (a.weight !== b.weight) return b.weight - a.weight;
      return a.otherEntry.displayTitle.localeCompare(b.otherEntry.displayTitle, 'en', {
        sensitivity: 'base',
      });
    })
    .slice(0, input.limit);
}

