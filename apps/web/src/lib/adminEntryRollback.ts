import { getPrismaClient } from '@synac/db';

import { normalizeTitle, slugify } from '@/lib/text';

function toJsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

type EntrySnapshot = {
  displayTitle?: unknown;
  normalizedTitle?: unknown;
  primarySlug?: unknown;
  status?: unknown;
  summaryMd?: unknown;
  summaryText?: unknown;
  editorialNotes?: unknown;
  publishedAt?: unknown;
};

export async function rollbackEntryToAuditEvent(input: {
  actorUserId: string;
  entryId: string;
  auditEventId: string;
}): Promise<void> {
  const prisma = getPrismaClient();

  await prisma.$transaction(async (tx) => {
    const entry = await tx.entry.findFirst({
      where: { id: input.entryId, deletedAt: null },
      select: {
        id: true,
        entryType: true,
        displayTitle: true,
        normalizedTitle: true,
        primarySlug: true,
        status: true,
        summaryMd: true,
        summaryText: true,
        editorialNotes: true,
        publishedAt: true,
        updatedByUserId: true,
      },
    });
    if (!entry) throw new Error('Entry not found');

    const auditEvent = await tx.auditEvent.findFirst({
      where: { id: input.auditEventId, entityType: 'ENTRY', entityId: entry.id },
      select: { id: true, action: true, before: true },
    });
    if (!auditEvent?.before) throw new Error('No rollback snapshot available');

    const before = auditEvent.before as EntrySnapshot;
    const data: Record<string, unknown> = { updatedByUserId: input.actorUserId };

    const nextDisplayTitle = typeof before.displayTitle === 'string' ? before.displayTitle : null;
    const nextPrimarySlug = typeof before.primarySlug === 'string' ? before.primarySlug : null;
    const nextSummaryMd = typeof before.summaryMd === 'string' ? before.summaryMd : null;
    const nextSummaryText = typeof before.summaryText === 'string' ? before.summaryText : null;
    const nextEditorialNotes = typeof before.editorialNotes === 'string' ? before.editorialNotes : null;
    const nextStatus = typeof before.status === 'string' ? before.status : null;
    const nextPublishedAt =
      typeof before.publishedAt === 'string'
        ? new Date(before.publishedAt)
        : before.publishedAt === null
          ? null
          : undefined;

    if (nextDisplayTitle !== null) {
      data.displayTitle = nextDisplayTitle;
      data.normalizedTitle =
        typeof before.normalizedTitle === 'string' ? before.normalizedTitle : normalizeTitle(nextDisplayTitle);
    }

    if (nextPrimarySlug !== null) {
      const desiredSlug = slugify(nextPrimarySlug);
      const conflict =
        desiredSlug !== entry.primarySlug &&
        (await tx.entry.findFirst({
          where: {
            entryType: entry.entryType,
            primarySlug: desiredSlug,
            deletedAt: null,
            NOT: { id: entry.id },
          },
          select: { id: true },
        }));
      const historyConflict =
        desiredSlug !== entry.primarySlug &&
        (await tx.entrySlugHistory.findFirst({
          where: {
            entryType: entry.entryType,
            slug: desiredSlug,
            NOT: { entryId: entry.id },
          },
          select: { id: true },
        }));

      if (conflict || historyConflict) {
        throw new Error(`Cannot roll back slug; slug already taken: ${desiredSlug}`);
      }

      if (desiredSlug !== entry.primarySlug) {
        await tx.entrySlugHistory.upsert({
          where: { entryType_slug: { entryType: entry.entryType, slug: entry.primarySlug } },
          update: {},
          create: { entryId: entry.id, entryType: entry.entryType, slug: entry.primarySlug },
        });
      }

      data.primarySlug = desiredSlug;
    }

    data.summaryMd = nextSummaryMd ?? null;
    data.summaryText = nextSummaryText ?? null;
    data.editorialNotes = nextEditorialNotes ?? null;
    if (nextStatus) data.status = nextStatus;
    if (nextPublishedAt !== undefined) data.publishedAt = nextPublishedAt;

    const updated = await tx.entry.update({
      where: { id: entry.id },
      data,
      select: {
        id: true,
        entryType: true,
        displayTitle: true,
        normalizedTitle: true,
        primarySlug: true,
        status: true,
        summaryMd: true,
        summaryText: true,
        editorialNotes: true,
        publishedAt: true,
      },
    });

    await tx.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        action: 'ENTRY_ROLLBACK',
        entityType: 'ENTRY',
        entityId: entry.id,
        before: toJsonSafe(entry),
        after: toJsonSafe(updated),
      },
    });
  });
}

