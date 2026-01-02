import { getPrismaClient } from '@synac/db';

import { markdownToText, normalizeTitle, slugify } from './text';

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function toJsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function isSlugTaken(
  entryType: 'TERM' | 'ACRONYM',
  candidate: string,
  entryIdToIgnore?: string,
): Promise<boolean> {
  const prisma = getPrismaClient();

  const [entry, history] = await Promise.all([
    prisma.entry.findFirst({
      where: {
        entryType,
        primarySlug: candidate,
        deletedAt: null,
        ...(entryIdToIgnore ? { NOT: { id: entryIdToIgnore } } : {}),
      },
      select: { id: true },
    }),
    prisma.entrySlugHistory.findFirst({
      where: {
        entryType,
        slug: candidate,
        ...(entryIdToIgnore ? { NOT: { entryId: entryIdToIgnore } } : {}),
      },
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

  const desiredSlug = input.primarySlug ? slugify(input.primarySlug) : slugify(displayTitle);
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
      select: { id: true, entryType: true, displayTitle: true, primarySlug: true, status: true },
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
        where: { entryType_slug: { entryType: before.entryType, slug: before.primarySlug } },
        update: {},
        create: { entryId: before.id, entryType: before.entryType, slug: before.primarySlug },
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

export async function updateSense(input: {
  actorUserId: string;
  senseId: string;
  senseLabel: string;
  expandedForm: string;
  definitionMd: string;
  isEditorial: boolean;
  editorialRationale: string;
}): Promise<void> {
  const prisma = getPrismaClient();

  const senseLabel = normalizeWhitespace(input.senseLabel);
  const expandedForm = normalizeWhitespace(input.expandedForm);
  const definitionMd = input.definitionMd.trim();
  const editorialRationale = input.editorialRationale.trim();

  await prisma.$transaction(async (tx) => {
    const before = await tx.sense.findFirst({
      where: { id: input.senseId, deletedAt: null },
      select: {
        id: true,
        entryId: true,
        senseOrder: true,
        senseLabel: true,
        expandedForm: true,
        definitionMd: true,
        definitionText: true,
        isEditorial: true,
        editorialRationale: true,
        status: true,
      },
    });
    if (!before) throw new Error('Sense not found');

    const definitionText = definitionMd ? markdownToText(definitionMd) : null;

    const after = await tx.sense.update({
      where: { id: before.id },
      data: {
        senseLabel: senseLabel || null,
        expandedForm: expandedForm || null,
        definitionMd: definitionMd || null,
        definitionText,
        isEditorial: input.isEditorial,
        editorialRationale: input.isEditorial ? (editorialRationale || null) : null,
      },
      select: {
        id: true,
        entryId: true,
        senseOrder: true,
        senseLabel: true,
        expandedForm: true,
        definitionMd: true,
        definitionText: true,
        isEditorial: true,
        editorialRationale: true,
        status: true,
      },
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
        senseOrder: input.direction === 'UP' ? sense.senseOrder - 1 : sense.senseOrder + 1,
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
        before: toJsonSafe({ senseId: sense.id, from: sense.senseOrder, to: neighbor.senseOrder }),
        after: toJsonSafe({ senseId: sense.id, from: sense.senseOrder, to: neighbor.senseOrder }),
      },
    });
  });
}

export async function publishEntry(input: {
  actorUserId: string;
  entryId: string;
}): Promise<{ publishedSenseCount: number }> {
  const prisma = getPrismaClient();

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const entry = await tx.entry.findFirst({
      where: { id: input.entryId, deletedAt: null },
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

    const publishable = senses.filter((s) => Boolean(s.definitionMd?.trim() || s.definitionText));
    if (publishable.length === 0) {
      throw new Error('Publishing requires at least one sense with a definition');
    }

    const provenanceCounts = await tx.fieldProvenance.groupBy({
      by: ['entityId'],
      where: { entityType: 'SENSE', entityId: { in: publishable.map((s) => s.id) } },
      _count: { _all: true },
    });
    const bySenseId = new Map(provenanceCounts.map((r) => [r.entityId, r._count._all]));

    const publishableWithCitations = publishable.filter((s) => {
      if (s.isEditorial && s.editorialRationale?.trim()) return true;
      return (bySenseId.get(s.id) ?? 0) > 0;
    });

    if (publishableWithCitations.length === 0) {
      throw new Error('Publishing requires citations per sense (or Editorial rationale)');
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

    return { publishedSenseCount: publishableWithCitations.length };
  });
}

export async function archiveEntry(input: {
  actorUserId: string;
  entryId: string;
}): Promise<void> {
  const prisma = getPrismaClient();

  await prisma.$transaction(async (tx) => {
    const before = await tx.entry.findFirst({
      where: { id: input.entryId, deletedAt: null },
      select: { id: true, status: true, publishedAt: true },
    });
    if (!before) throw new Error('Entry not found');

    const after = await tx.entry.update({
      where: { id: before.id },
      data: { status: 'ARCHIVED', updatedByUserId: input.actorUserId },
      select: { id: true, status: true, publishedAt: true },
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
  });
}
