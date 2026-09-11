import {
  getPrismaClient,
  markdownToText,
  normalizeTitle,
  normalizeWhitespace,
  slugify,
  syncAutoTagsForPublishedEntry,
  toJsonSafe,
  type DbTransactionClient,
  type Prisma,
} from '@synac/db';

import { revalidateEntry } from './cacheTags';

async function isSlugTaken(
  entryType: 'TERM' | 'ACRONYM',
  candidate: string,
  entryIdToIgnore?: string,
): Promise<boolean> {
  const prisma = getPrismaClient();

  const entryWhere: Prisma.EntryWhereInput = {
    entryType,
    primarySlug: candidate,
    deletedAt: null,
  };
  const historyWhere: Prisma.EntrySlugHistoryWhereInput = {
    entryType,
    slug: candidate,
  };
  if (entryIdToIgnore) {
    entryWhere.NOT = { id: entryIdToIgnore };
    historyWhere.NOT = { entryId: entryIdToIgnore };
  }

  const [entry, history] = await Promise.all([
    prisma.entry.findFirst({ where: entryWhere, select: { id: true } }),
    prisma.entrySlugHistory.findFirst({
      where: historyWhere,
      select: { id: true },
    }),
  ]);

  return Boolean(entry || history);
}

async function ensureUniqueSlug(
  entryType: 'TERM' | 'ACRONYM',
  desiredSlug: string,
  entryIdToIgnore?: string,
): Promise<string> {
  const base = desiredSlug || 'entry';

  let candidate = base;
  for (let attempt = 0; attempt < 50; attempt++) {
    const taken = await isSlugTaken(entryType, candidate, entryIdToIgnore);
    if (!taken) return candidate;
    candidate = `${base}-${attempt + 2}`;
  }

  throw new Error('Unable to find a unique slug (too many collisions)');
}

export async function createDraftEntry(input: {
  actorUserId: string;
  entryType: 'TERM' | 'ACRONYM';
  displayTitle: string;
  primarySlug?: string;
}): Promise<{ entryId: string }> {
  const prisma = getPrismaClient();
  const displayTitle = normalizeWhitespace(input.displayTitle);
  if (!displayTitle) throw new Error('displayTitle is required');

  const desiredSlug = input.primarySlug
    ? slugify(input.primarySlug)
    : slugify(displayTitle);
  const uniqueSlug = await ensureUniqueSlug(input.entryType, desiredSlug);

  const normalizedTitle = normalizeTitle(displayTitle);

  const entry = await prisma.$transaction(async (tx) => {
    const created = await tx.entry.create({
      data: {
        entryType: input.entryType,
        displayTitle,
        normalizedTitle,
        primarySlug: uniqueSlug,
        status: 'DRAFT',
        createdByUserId: input.actorUserId,
        updatedByUserId: input.actorUserId,
      },
      select: {
        id: true,
        entryType: true,
        displayTitle: true,
        primarySlug: true,
        status: true,
      },
    });

    await tx.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        action: 'ENTRY_CREATE',
        entityType: 'ENTRY',
        entityId: created.id,
        after: toJsonSafe(created),
      },
    });

    return created;
  });

  return { entryId: entry.id };
}

export async function updateEntry(input: {
  actorUserId: string;
  entryId: string;
  displayTitle: string;
  primarySlug: string;
  summaryMd: string;
  editorialNotes: string;
}): Promise<void> {
  const prisma = getPrismaClient();

  const displayTitle = normalizeWhitespace(input.displayTitle);
  const summaryMd = input.summaryMd.trim();
  const editorialNotes = input.editorialNotes.trim();

  if (!displayTitle) throw new Error('displayTitle is required');

  await prisma.$transaction(async (tx) => {
    const before = await tx.entry.findFirst({
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
      },
    });

    if (!before) throw new Error('Entry not found');

    const desiredSlug = slugify(input.primarySlug || before.primarySlug);
    const uniqueSlug =
      desiredSlug === before.primarySlug
        ? desiredSlug
        : await ensureUniqueSlug(before.entryType, desiredSlug, before.id);

    if (uniqueSlug !== before.primarySlug) {
      await tx.entrySlugHistory.upsert({
        where: {
          entryType_slug: {
            entryType: before.entryType,
            slug: before.primarySlug,
          },
        },
        update: {},
        create: {
          entryId: before.id,
          entryType: before.entryType,
          slug: before.primarySlug,
        },
      });
    }

    const normalizedTitle = normalizeTitle(displayTitle);
    const summaryText = summaryMd ? markdownToText(summaryMd) : null;

    const after = await tx.entry.update({
      where: { id: before.id },
      data: {
        displayTitle,
        normalizedTitle,
        primarySlug: uniqueSlug,
        summaryMd: summaryMd || null,
        summaryText,
        editorialNotes: editorialNotes || null,
        updatedByUserId: input.actorUserId,
      },
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
      },
    });

    await tx.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        action: 'ENTRY_UPDATE',
        entityType: 'ENTRY',
        entityId: before.id,
        before: toJsonSafe(before),
        after: toJsonSafe(after),
      },
    });
  });
}

export async function createDraftSense(input: {
  actorUserId: string;
  entryId: string;
}): Promise<{ senseId: string }> {
  const prisma = getPrismaClient();

  const result = await prisma.$transaction(async (tx) => {
    const entry = await tx.entry.findFirst({
      where: { id: input.entryId, deletedAt: null },
      select: { id: true },
    });
    if (!entry) throw new Error('Entry not found');

    const last = await tx.sense.findFirst({
      where: { entryId: input.entryId, deletedAt: null },
      orderBy: [{ senseOrder: 'desc' }],
      select: { senseOrder: true },
    });

    const senseOrder = (last?.senseOrder ?? -1) + 1;

    const created = await tx.sense.create({
      data: {
        entryId: input.entryId,
        senseOrder,
        status: 'DRAFT',
        isPreferred: senseOrder === 0,
      },
      select: { id: true, entryId: true, senseOrder: true, status: true },
    });

    await tx.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        action: 'SENSE_CREATE',
        entityType: 'SENSE',
        entityId: created.id,
        after: toJsonSafe(created),
      },
    });

    return created;
  });

  return { senseId: result.id };
}

const senseSelect = {
  id: true,
  entryId: true,
  senseOrder: true,
  senseLabel: true,
  slug: true,
  needsLabel: true,
  disambiguationNote: true,
  expandedForm: true,
  definitionMd: true,
  definitionText: true,
  isEditorial: true,
  editorialRationale: true,
  status: true,
} as const;

/**
 * A sense slug is what the `#s-<slug>` deep link resolves to, so it has to be
 * unique within its entry. There is no slug history for senses: a renamed sense
 * simply moves, and the old fragment lands on the entry.
 */
async function ensureUniqueSenseSlug(
  tx: DbTransactionClient,
  input: { entryId: string; senseId: string; desired: string },
): Promise<string> {
  const base = input.desired || 'sense';

  let candidate = base;
  for (let attempt = 0; attempt < 50; attempt++) {
    const taken = await tx.sense.findFirst({
      where: {
        entryId: input.entryId,
        slug: candidate,
        deletedAt: null,
        NOT: { id: input.senseId },
      },
      select: { id: true },
    });
    if (!taken) return candidate;
    candidate = `${base}-${attempt + 2}`;
  }

  throw new Error('Unable to find a unique sense slug (too many collisions)');
}

export async function updateSense(input: {
  actorUserId: string;
  senseId: string;
  senseLabel: string;
  expandedForm: string;
  definitionMd: string;
  isEditorial: boolean;
  editorialRationale: string;
  /** Blank regenerates the slug from the label; omitted leaves it untouched. */
  slug?: string;
  disambiguationNote?: string;
  /** Pass `false` to clear the "an editor still has to name this" flag. */
  needsLabel?: boolean;
}): Promise<void> {
  const prisma = getPrismaClient();

  const senseLabel = normalizeWhitespace(input.senseLabel);
  const expandedForm = normalizeWhitespace(input.expandedForm);
  const definitionMd = input.definitionMd.trim();
  const editorialRationale = input.editorialRationale.trim();
  const disambiguationNote =
    input.disambiguationNote === undefined
      ? undefined
      : input.disambiguationNote.trim();

  await prisma.$transaction(async (tx) => {
    const before = await tx.sense.findFirst({
      where: { id: input.senseId, deletedAt: null },
      select: senseSelect,
    });
    if (!before) throw new Error('Sense not found');

    const definitionText = definitionMd ? markdownToText(definitionMd) : null;

    // Slug rules: an explicit value wins; otherwise a labelled sense derives one
    // from its label (so naming a sense also gives it a stable deep link), and a
    // still-unlabelled sense keeps whatever it had.
    let nextSlug: string | null | undefined;
    if (input.slug !== undefined) {
      const desired = slugify(input.slug.trim() ? input.slug : senseLabel);
      nextSlug = desired
        ? await ensureUniqueSenseSlug(tx, {
            entryId: before.entryId,
            senseId: before.id,
            desired,
          })
        : null;
    } else if (senseLabel && !before.slug) {
      const desired = slugify(senseLabel);
      nextSlug = desired
        ? await ensureUniqueSenseSlug(tx, {
            entryId: before.entryId,
            senseId: before.id,
            desired,
          })
        : null;
    }

    const data: Prisma.SenseUpdateInput = {
      senseLabel: senseLabel || null,
      expandedForm: expandedForm || null,
      definitionMd: definitionMd || null,
      definitionText,
      isEditorial: input.isEditorial,
      editorialRationale: input.isEditorial ? editorialRationale || null : null,
    };

    if (nextSlug !== undefined) data.slug = nextSlug;
    if (disambiguationNote !== undefined)
      data.disambiguationNote = disambiguationNote || null;

    if (input.needsLabel !== undefined) data.needsLabel = input.needsLabel;
    // Naming a sense is exactly what `needsLabel` was waiting for.
    else if (senseLabel && before.needsLabel) data.needsLabel = false;

    const after = await tx.sense.update({
      where: { id: before.id },
      data,
      select: senseSelect,
    });

    await tx.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        action: 'SENSE_UPDATE',
        entityType: 'SENSE',
        entityId: before.id,
        before: toJsonSafe(before),
        after: toJsonSafe(after),
      },
    });

    return after;
  });

  await revalidateForSense(input.senseId);
}

/**
 * Choose which source attestation provides the rendered definition for a sense.
 *
 * Exactly one attestation is primary, and the sense's own `definitionMd` mirrors
 * it, so flipping the primary also rewrites what the public page shows.
 */
export async function setPrimarySenseDefinition(input: {
  actorUserId: string;
  senseDefinitionId: string;
}): Promise<{ senseId: string }> {
  const prisma = getPrismaClient();

  const senseId = await prisma.$transaction(async (tx) => {
    const definition = await tx.senseDefinition.findFirst({
      where: { id: input.senseDefinitionId },
      select: {
        id: true,
        senseId: true,
        definitionMd: true,
        definitionText: true,
        isPrimary: true,
      },
    });
    if (!definition) throw new Error('Sense definition not found');

    await tx.senseDefinition.updateMany({
      where: { senseId: definition.senseId, NOT: { id: definition.id } },
      data: { isPrimary: false },
    });

    await tx.senseDefinition.update({
      where: { id: definition.id },
      data: { isPrimary: true },
    });

    await tx.sense.update({
      where: { id: definition.senseId },
      data: {
        definitionMd: definition.definitionMd,
        definitionText: definition.definitionText,
      },
    });

    await tx.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        action: 'SENSE_DEFINITION_SET_PRIMARY',
        entityType: 'SENSE',
        entityId: definition.senseId,
        after: toJsonSafe({ senseDefinitionId: definition.id }),
      },
    });

    return definition.senseId;
  });

  await revalidateForSense(senseId);

  return { senseId };
}

/** Refresh the public entry page a sense belongs to, if that entry is published. */
async function revalidateForSense(senseId: string): Promise<void> {
  const prisma = getPrismaClient();
  const sense = await prisma.sense.findFirst({
    where: { id: senseId },
    select: {
      entry: {
        select: {
          entryType: true,
          primarySlug: true,
          status: true,
          entryTags: { select: { tag: { select: { slug: true } } } },
        },
      },
    },
  });
  if (!sense || sense.entry.status !== 'PUBLISHED') return;

  revalidateEntry({
    entryType: sense.entry.entryType,
    slug: sense.entry.primarySlug,
    tagSlugs: sense.entry.entryTags.map((link) => link.tag.slug),
  });
}

export async function moveSense(input: {
  actorUserId: string;
  senseId: string;
  direction: 'UP' | 'DOWN';
}): Promise<void> {
  const prisma = getPrismaClient();

  await prisma.$transaction(async (tx) => {
    const sense = await tx.sense.findFirst({
      where: { id: input.senseId, deletedAt: null },
      select: { id: true, entryId: true, senseOrder: true },
    });
    if (!sense) throw new Error('Sense not found');

    const neighbor = await tx.sense.findFirst({
      where: {
        entryId: sense.entryId,
        deletedAt: null,
        senseOrder:
          input.direction === 'UP'
            ? sense.senseOrder - 1
            : sense.senseOrder + 1,
      },
      select: { id: true, senseOrder: true },
    });
    if (!neighbor) return;

    await tx.sense.update({
      where: { id: sense.id },
      data: { senseOrder: neighbor.senseOrder },
    });
    await tx.sense.update({
      where: { id: neighbor.id },
      data: { senseOrder: sense.senseOrder },
    });

    await tx.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        action: 'SENSE_REORDER',
        entityType: 'ENTRY',
        entityId: sense.entryId,
        before: toJsonSafe({
          senseId: sense.id,
          from: sense.senseOrder,
          to: neighbor.senseOrder,
        }),
        after: toJsonSafe({
          senseId: sense.id,
          from: sense.senseOrder,
          to: neighbor.senseOrder,
        }),
      },
    });
  });
}

export async function publishEntry(input: {
  actorUserId: string;
  entryId: string;
}): Promise<{
  publishedSenseCount: number;
  entryType: 'TERM' | 'ACRONYM';
  primarySlug: string;
}> {
  const prisma = getPrismaClient();

  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const entry = await tx.entry.findFirst({
      where: { id: input.entryId, deletedAt: null },
      select: {
        id: true,
        entryType: true,
        primarySlug: true,
        status: true,
        summaryMd: true,
        summaryText: true,
        editorialNotes: true,
        publishedAt: true,
      },
    });
    if (!entry) throw new Error('Entry not found');

    if (!entry.summaryMd?.trim()) {
      throw new Error('Publishing requires a summary');
    }

    const senses = await tx.sense.findMany({
      where: { entryId: entry.id, deletedAt: null },
      select: {
        id: true,
        definitionMd: true,
        definitionText: true,
        isEditorial: true,
        editorialRationale: true,
      },
      orderBy: [{ senseOrder: 'asc' }],
    });

    const publishable = senses.filter((s) =>
      Boolean(s.definitionMd?.trim() || s.definitionText),
    );
    if (publishable.length === 0) {
      throw new Error(
        'Publishing requires at least one sense with a definition',
      );
    }

    const provenanceCounts = await tx.fieldProvenance.groupBy({
      by: ['entityId'],
      where: {
        entityType: 'SENSE',
        entityId: { in: publishable.map((s) => s.id) },
      },
      _count: { _all: true },
    });
    const bySenseId = new Map(
      provenanceCounts.map((r) => [r.entityId, r._count._all]),
    );

    const publishableWithCitations = publishable.filter((s) => {
      if (s.isEditorial && s.editorialRationale?.trim()) return true;
      return (bySenseId.get(s.id) ?? 0) > 0;
    });

    if (publishableWithCitations.length === 0) {
      throw new Error(
        'Publishing requires citations per sense (or Editorial rationale)',
      );
    }

    const before = entry;

    const after = await tx.entry.update({
      where: { id: entry.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: entry.status === 'PUBLISHED' ? entry.publishedAt : now,
        updatedByUserId: input.actorUserId,
      },
      select: {
        id: true,
        entryType: true,
        status: true,
        summaryMd: true,
        summaryText: true,
        editorialNotes: true,
        publishedAt: true,
      },
    });

    await tx.sense.updateMany({
      where: { id: { in: publishableWithCitations.map((s) => s.id) } },
      data: { status: 'PUBLISHED', publishedAt: now },
    });

    await syncAutoTagsForPublishedEntry(tx, { entryId: entry.id });

    await tx.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        action: 'ENTRY_PUBLISH',
        entityType: 'ENTRY',
        entityId: entry.id,
        before: toJsonSafe(before),
        after: toJsonSafe(after),
      },
    });

    const tagLinks = await tx.entryTag.findMany({
      where: { entryId: entry.id, tag: { deletedAt: null } },
      select: { tag: { select: { slug: true } } },
    });

    return {
      publishedSenseCount: publishableWithCitations.length,
      entryType: entry.entryType,
      primarySlug: entry.primarySlug,
      tagSlugs: tagLinks.map((link) => link.tag.slug),
    };
  });

  // Cache invalidation happens after the transaction commits: revalidating a
  // tag for a write that then rolls back would evict a still-correct page.
  revalidateEntry({
    entryType: result.entryType,
    slug: result.primarySlug,
    tagSlugs: result.tagSlugs,
  });

  return {
    publishedSenseCount: result.publishedSenseCount,
    entryType: result.entryType,
    primarySlug: result.primarySlug,
  };
}

export async function archiveEntry(input: {
  actorUserId: string;
  entryId: string;
}): Promise<void> {
  const prisma = getPrismaClient();

  const archived = await prisma.$transaction(async (tx) => {
    const before = await tx.entry.findFirst({
      where: { id: input.entryId, deletedAt: null },
      select: {
        id: true,
        entryType: true,
        primarySlug: true,
        status: true,
        publishedAt: true,
      },
    });
    if (!before) throw new Error('Entry not found');

    const after = await tx.entry.update({
      where: { id: before.id },
      data: { status: 'ARCHIVED', updatedByUserId: input.actorUserId },
      select: {
        id: true,
        entryType: true,
        primarySlug: true,
        status: true,
        publishedAt: true,
      },
    });

    await tx.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        action: 'ENTRY_ARCHIVE',
        entityType: 'ENTRY',
        entityId: before.id,
        before: toJsonSafe(before),
        after: toJsonSafe(after),
      },
    });

    const tagLinks = await tx.entryTag.findMany({
      where: { entryId: before.id, tag: { deletedAt: null } },
      select: { tag: { select: { slug: true } } },
    });

    return { ...after, tagSlugs: tagLinks.map((link) => link.tag.slug) };
  });

  revalidateEntry({
    entryType: archived.entryType,
    slug: archived.primarySlug,
    tagSlugs: archived.tagSlugs,
  });
}
