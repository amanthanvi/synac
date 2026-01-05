import type { Prisma, PrismaClient } from '@synac/db';

import { ensureSystemActor } from '@synac/db';

import { logger } from '../logger.js';
import { markdownToText, normalizeTitle, slugify } from './text.js';
import { parseContentMode, parseExtractionMethod, parseProposedChange } from './types.js';

function toJsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function isSlugTaken(
  tx: PrismaClient | Prisma.TransactionClient,
  entryType: 'TERM' | 'ACRONYM',
  candidate: string,
): Promise<boolean> {
  const [entry, history] = await Promise.all([
    tx.entry.findFirst({
      where: {
        entryType,
        primarySlug: candidate,
        deletedAt: null,
      },
      select: { id: true },
    }),
    tx.entrySlugHistory.findFirst({
      where: {
        entryType,
        slug: candidate,
      },
      select: { id: true },
    }),
  ]);

  return Boolean(entry || history);
}

async function ensureUniqueSlug(
  tx: PrismaClient | Prisma.TransactionClient,
  entryType: 'TERM' | 'ACRONYM',
  desiredSlug: string,
): Promise<string> {
  const base = desiredSlug || 'entry';
  let candidate = base;

  for (let attempt = 0; attempt < 50; attempt++) {
    const taken = await isSlugTaken(tx, entryType, candidate);
    if (!taken) return candidate;
    candidate = `${base}-${attempt + 2}`;
  }

  throw new Error('Unable to find a unique slug (too many collisions)');
}

async function findSenseIdForSourceUrl(
  tx: PrismaClient | Prisma.TransactionClient,
  input: { entryId: string; sourceId: string; citationUrl: string },
): Promise<string | null> {
  const senseIds = await tx.sense.findMany({
    where: { entryId: input.entryId, deletedAt: null },
    select: { id: true },
  });

  if (senseIds.length === 0) return null;

  const match = await tx.fieldProvenance.findFirst({
    where: {
      entityType: 'SENSE',
      fieldName: 'definitionMd',
      entityId: { in: senseIds.map((s) => s.id) },
      citation: { sourceId: input.sourceId, url: input.citationUrl },
    },
    orderBy: [{ extractedAt: 'desc' }],
    select: { entityId: true },
  });

  return match?.entityId ?? null;
}

async function publishEntry(
  tx: PrismaClient | Prisma.TransactionClient,
  input: { actorUserId: string; entryId: string },
): Promise<{ publishedSenseCount: number }> {
  const now = new Date();

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
    select: { id: true, definitionMd: true, definitionText: true, isEditorial: true, editorialRationale: true },
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
}

async function applyAndPublishItem(
  tx: PrismaClient | Prisma.TransactionClient,
  input: {
    actorUserId: string;
    item: {
      id: string;
      stage: string;
      licenseGate: 'PASS' | 'WARN' | 'FAIL';
      proposedChange: unknown;
      ingestRunId: string;
      sourceDocumentId: string;
      ingestRun: {
        sourceId: string;
        source: { id: string; name: string; licenseNotes: string | null; attributionRequirements: string; accessMethod: string };
      };
      sourceDocument: { url: string; canonicalUrl: string | null; fetchedAt: Date; doNotUse: boolean; doNotUseReason: string | null };
    };
  },
): Promise<{ entryId: string; appliedSenseIds: string[]; publishedSenseCount: number }> {
  const item = input.item;

  if (item.stage === 'APPLIED' || item.stage === 'REJECTED') {
    throw new Error(`Item not eligible for auto-apply (stage=${item.stage})`);
  }
  if (item.licenseGate === 'FAIL') {
    throw new Error('Item not eligible for auto-apply (licenseGate=FAIL)');
  }
  if (item.sourceDocument.doNotUse) {
    const reason = item.sourceDocument.doNotUseReason?.trim() ? `: ${item.sourceDocument.doNotUseReason.trim()}` : '';
    throw new Error(`Item not eligible for auto-apply (SourceDocument do-not-use${reason})`);
  }

  const proposed = parseProposedChange(item.proposedChange);
  if (!proposed.displayTitle.trim()) throw new Error('proposedChange.displayTitle is required');

  const senses = proposed.senses.filter((s) => Boolean(s.definitionMd?.trim()));
  if (senses.length === 0) throw new Error('proposedChange requires at least one sense definition');

  const inferredSummary = proposed.kind === 'CREATE_ENTRY' ? proposed.summaryMd?.trim() : proposed.summaryMd?.trim() ?? '';
  const summaryMd = inferredSummary || senses[0]!.definitionMd.trim();

  const entryType = proposed.entryType;
  const normalizedTitle = normalizeTitle(proposed.displayTitle);

  const existingEntry = await tx.entry.findFirst({
    where: { entryType, normalizedTitle, deletedAt: null },
    select: { id: true, status: true, summaryMd: true },
  });

  let entryId: string;
  if (existingEntry) {
    entryId = existingEntry.id;
    if (!existingEntry.summaryMd?.trim() && summaryMd.trim()) {
      const before = await tx.entry.findFirst({
        where: { id: entryId, deletedAt: null },
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

      const summaryText = markdownToText(summaryMd);
      const after = await tx.entry.update({
        where: { id: entryId },
        data: {
          summaryMd: summaryMd || null,
          summaryText: summaryText || null,
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

      if (before) {
        await tx.auditEvent.create({
          data: {
            actorUserId: input.actorUserId,
            action: 'ENTRY_UPDATE',
            entityType: 'ENTRY',
            entityId: entryId,
            before: toJsonSafe(before),
            after: toJsonSafe(after),
          },
        });
      }
    }
  } else {
    const desiredSlug = proposed.kind === 'CREATE_ENTRY' && proposed.primarySlug ? slugify(proposed.primarySlug) : slugify(proposed.displayTitle);
    const uniqueSlug = await ensureUniqueSlug(tx, entryType, desiredSlug);

    const entry = await tx.entry.create({
      data: {
        entryType,
        displayTitle: proposed.displayTitle.trim(),
        normalizedTitle,
        primarySlug: uniqueSlug,
        status: 'DRAFT',
        summaryMd: summaryMd.trim() || null,
        summaryText: summaryMd.trim() ? markdownToText(summaryMd) : null,
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
        entityId: entry.id,
        after: toJsonSafe(entry),
      },
    });

    entryId = entry.id;
  }

  const citationUrl = item.sourceDocument.canonicalUrl ?? item.sourceDocument.url;
  const citation = await tx.citation.create({
    data: {
      sourceId: item.ingestRun.source.id,
      sourceDocumentId: item.sourceDocumentId,
      url: citationUrl,
      citationText: item.ingestRun.source.name,
      licenseNote: item.ingestRun.source.licenseNotes,
      attributionText: item.ingestRun.source.attributionRequirements,
      accessedAt: item.sourceDocument.fetchedAt,
    },
    select: { id: true },
  });

  const firstSense = senses[0]!;
  const extractionMethod = parseExtractionMethod(firstSense.extractionMethod ?? item.ingestRun.source.accessMethod);
  const extractorVersion = firstSense.extractorVersion?.trim() ? firstSense.extractorVersion.trim() : 'synac-worker';
  const contentMode = parseContentMode(firstSense.contentMode);

  const appliedSenseIds: string[] = [];
  const provenance: Array<{
    entityType: 'ENTRY' | 'SENSE';
    entityId: string;
    fieldName: string;
    citationId: string;
    contentMode: typeof contentMode;
    extractionMethod: typeof extractionMethod;
    extractorVersion: string;
    extractedAt: Date;
    sourceLocator?: Prisma.InputJsonValue;
  }> = [];

  const entryAfter = await tx.entry.findFirst({ where: { id: entryId, deletedAt: null }, select: { summaryMd: true } });
  if (!entryAfter?.summaryMd?.trim() && summaryMd.trim()) {
    await tx.entry.update({
      where: { id: entryId },
      data: { summaryMd: summaryMd.trim(), summaryText: markdownToText(summaryMd.trim()) },
      select: { id: true },
    });
  }

  if (summaryMd.trim()) {
    provenance.push({
      entityType: 'ENTRY',
      entityId: entryId,
      fieldName: 'summaryMd',
      citationId: citation.id,
      contentMode,
      extractionMethod,
      extractorVersion,
      extractedAt: item.sourceDocument.fetchedAt,
      sourceLocator: firstSense.sourceLocator as Prisma.InputJsonValue,
    });
  }

  for (const sense of senses) {
    const targetSenseId = await findSenseIdForSourceUrl(tx, {
      entryId,
      sourceId: item.ingestRun.source.id,
      citationUrl,
    });

    if (targetSenseId) {
      const before = await tx.sense.findFirst({
        where: { id: targetSenseId, deletedAt: null },
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

      const definitionMd = sense.definitionMd.trim();
      const after = await tx.sense.update({
        where: { id: targetSenseId },
        data: {
          senseLabel: sense.senseLabel?.trim() ? sense.senseLabel.trim() : null,
          expandedForm: sense.expandedForm?.trim() ? sense.expandedForm.trim() : null,
          definitionMd: definitionMd || null,
          definitionText: definitionMd ? markdownToText(definitionMd) : null,
          isEditorial: false,
          editorialRationale: null,
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

      if (before) {
        await tx.auditEvent.create({
          data: {
            actorUserId: input.actorUserId,
            action: 'SENSE_UPDATE',
            entityType: 'SENSE',
            entityId: targetSenseId,
            before: toJsonSafe(before),
            after: toJsonSafe(after),
          },
        });
      }

      appliedSenseIds.push(targetSenseId);
    } else {
      const last = await tx.sense.findFirst({
        where: { entryId, deletedAt: null },
        orderBy: [{ senseOrder: 'desc' }],
        select: { senseOrder: true },
      });
      const senseOrder = (last?.senseOrder ?? -1) + 1;

      const definitionMd = sense.definitionMd.trim();

      const created = await tx.sense.create({
        data: {
          entryId,
          senseOrder,
          senseLabel: sense.senseLabel?.trim() ? sense.senseLabel.trim() : null,
          expandedForm: sense.expandedForm?.trim() ? sense.expandedForm.trim() : null,
          definitionMd: definitionMd || null,
          definitionText: definitionMd ? markdownToText(definitionMd) : null,
          isEditorial: false,
          editorialRationale: null,
          isPreferred: senseOrder === 0,
          status: 'DRAFT',
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

      appliedSenseIds.push(created.id);
    }

    const senseId = appliedSenseIds[appliedSenseIds.length - 1]!;
    provenance.push({
      entityType: 'SENSE',
      entityId: senseId,
      fieldName: 'definitionMd',
      citationId: citation.id,
      contentMode: parseContentMode(sense.contentMode),
      extractionMethod: parseExtractionMethod(sense.extractionMethod ?? extractionMethod),
      extractorVersion: sense.extractorVersion?.trim() ? sense.extractorVersion.trim() : extractorVersion,
      extractedAt: item.sourceDocument.fetchedAt,
      sourceLocator: sense.sourceLocator as Prisma.InputJsonValue,
    });
  }

  await tx.fieldProvenance.createMany({ data: provenance });

  await tx.ingestItem.update({
    where: { id: item.id },
    data: {
      stage: 'APPLIED',
      diff: { appliedEntryId: entryId, appliedSenseIds, autoApplied: true },
      error: null,
    },
  });

  await tx.auditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      action: 'INGEST_ITEM_AUTO_APPLY',
      entityType: 'INGEST_ITEM',
      entityId: item.id,
      after: { appliedEntryId: entryId, appliedSenseIds, autoApplied: true },
    },
  });

  const { publishedSenseCount } = await publishEntry(tx, { actorUserId: input.actorUserId, entryId });

  return { entryId, appliedSenseIds, publishedSenseCount };
}

export async function autoApplyTier1IngestItems(
  prod: PrismaClient,
  input: { maxItems: number },
): Promise<{ applied: number; skipped: number; failed: number }> {
  const system = await ensureSystemActor(prod);
  const actorUserId = system.id;

  const candidates = await prod.ingestItem.findMany({
    where: {
      stage: { in: ['VALIDATED', 'REVIEWED'] },
      licenseGate: { in: ['PASS', 'WARN'] },
      error: null,
      ingestRun: {
        status: 'SUCCESS',
        source: { trustTier: 'TIER_1', enabled: true, lastVerifiedAt: { not: null } },
      },
    },
    select: {
      id: true,
      stage: true,
      licenseGate: true,
      proposedChange: true,
      ingestRunId: true,
      sourceDocumentId: true,
      ingestRun: {
        select: {
          sourceId: true,
          source: {
            select: {
              id: true,
              name: true,
              licenseNotes: true,
              attributionRequirements: true,
              accessMethod: true,
            },
          },
        },
      },
      sourceDocument: {
        select: {
          url: true,
          canonicalUrl: true,
          fetchedAt: true,
          doNotUse: true,
          doNotUseReason: true,
        },
      },
    },
    orderBy: [{ id: 'asc' }],
    take: Math.max(1, Math.min(100, input.maxItems)),
  });

  let applied = 0;
  let skipped = 0;
  let failed = 0;

  for (const candidate of candidates) {
    try {
      await prod.$transaction(async (tx) => {
        const fresh = await tx.ingestItem.findFirst({
          where: { id: candidate.id },
          select: {
            id: true,
            stage: true,
            licenseGate: true,
            proposedChange: true,
            ingestRunId: true,
            sourceDocumentId: true,
            ingestRun: {
              select: {
                sourceId: true,
                source: {
                  select: {
                    id: true,
                    name: true,
                    licenseNotes: true,
                    attributionRequirements: true,
                    accessMethod: true,
                    trustTier: true,
                    enabled: true,
                    lastVerifiedAt: true,
                  },
                },
              },
            },
            sourceDocument: {
              select: { url: true, canonicalUrl: true, fetchedAt: true, doNotUse: true, doNotUseReason: true },
            },
          },
        });

        if (!fresh) {
          skipped += 1;
          return;
        }
        if (fresh.stage !== 'VALIDATED' && fresh.stage !== 'REVIEWED') {
          skipped += 1;
          return;
        }
        if (fresh.licenseGate === 'FAIL') {
          skipped += 1;
          return;
        }
        if (!fresh.ingestRun.source.enabled || !fresh.ingestRun.source.lastVerifiedAt || fresh.ingestRun.source.trustTier !== 'TIER_1') {
          skipped += 1;
          return;
        }

        await applyAndPublishItem(tx, { actorUserId, item: fresh });
        applied += 1;
      });
    } catch (err) {
      failed += 1;
      logger.warn('autopublish.item_failed', {
        ingestItemId: candidate.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { applied, skipped, failed };
}
