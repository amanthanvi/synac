import {
  getPrismaClient,
  normalizeTitle,
  slugify,
  toJsonSafe,
} from '@synac/db';

import { revalidateEntry } from '@/lib/cacheTags';
import {
  entryRollbackSnapshotSchema,
  type EntryRollbackSnapshot,
} from '@/lib/validation';

/** The columns a rollback may restore. Everything else on the row is left alone. */
type EntryRollbackUpdate = {
  updatedByUserId: string;
  summaryMd: string | null;
  summaryText: string | null;
  editorialNotes: string | null;
  displayTitle?: string;
  normalizedTitle?: string;
  primarySlug?: string;
  status?: NonNullable<EntryRollbackSnapshot['status']>;
  publishedAt?: Date | null;
};

export async function rollbackEntryToAuditEvent(input: {
  actorUserId: string;
  entryId: string;
  auditEventId: string;
}): Promise<void> {
  const prisma = getPrismaClient();

  let previousSlug = '';

  const result = await prisma.$transaction(async (tx) => {
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
    previousSlug = entry.primarySlug;

    const auditEvent = await tx.auditEvent.findFirst({
      where: {
        id: input.auditEventId,
        entityType: 'ENTRY',
        entityId: entry.id,
      },
      select: { id: true, action: true, before: true },
    });
    if (!auditEvent?.before) throw new Error('No rollback snapshot available');

    // An audit snapshot is data we wrote, but it has been through a JSON column
    // and possibly an older schema: validate it before feeding it back into an
    // update. In particular an unrecognised `status` string used to be written
    // straight through, which Prisma would reject at runtime with an opaque
    // error (or, worse, a future enum value would silently change meaning).
    const parsed = entryRollbackSnapshotSchema.safeParse(auditEvent.before);
    if (!parsed.success) {
      throw new Error('Rollback snapshot is not a valid entry snapshot');
    }

    const before = parsed.data;
    const data: EntryRollbackUpdate = {
      updatedByUserId: input.actorUserId,
      summaryMd: before.summaryMd ?? null,
      summaryText: before.summaryText ?? null,
      editorialNotes: before.editorialNotes ?? null,
    };

    if (before.displayTitle !== undefined) {
      data.displayTitle = before.displayTitle;
      data.normalizedTitle =
        before.normalizedTitle ?? normalizeTitle(before.displayTitle);
    }

    if (before.status) data.status = before.status;

    if (before.publishedAt !== undefined) {
      data.publishedAt =
        before.publishedAt === null ? null : new Date(before.publishedAt);
    }

    if (before.primarySlug !== undefined) {
      const desiredSlug = slugify(before.primarySlug);

      if (desiredSlug !== entry.primarySlug) {
        const conflict = await tx.entry.findFirst({
          where: {
            entryType: entry.entryType,
            primarySlug: desiredSlug,
            deletedAt: null,
            NOT: { id: entry.id },
          },
          select: { id: true },
        });
        const historyConflict = await tx.entrySlugHistory.findFirst({
          where: {
            entryType: entry.entryType,
            slug: desiredSlug,
            NOT: { entryId: entry.id },
          },
          select: { id: true },
        });

        if (conflict || historyConflict) {
          throw new Error(
            `Cannot roll back slug; slug already taken: ${desiredSlug}`,
          );
        }

        await tx.entrySlugHistory.upsert({
          where: {
            entryType_slug: {
              entryType: entry.entryType,
              slug: entry.primarySlug,
            },
          },
          update: {},
          create: {
            entryId: entry.id,
            entryType: entry.entryType,
            slug: entry.primarySlug,
          },
        });
      }

      data.primarySlug = desiredSlug;
    }

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

    return updated;
  });

  // A rollback can move the slug, so invalidate both the slug it had and the
  // slug it now has.
  revalidateEntry({
    entryType: result.entryType,
    slug: result.primarySlug,
    previousSlugs: [previousSlug],
  });
}
