import { getPrismaClient } from '@synac/db';

import { getBoss } from '@/lib/boss';
import { createDraftEntry, createDraftSense, updateEntry, updateSense } from '@/lib/adminEntries';

function toJsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeMaxItems(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.max(1, Math.min(1000, Math.floor(value)));
}

export async function createIngestRun(input: {
  actorUserId: string;
  sourceId: string;
  maxItems: number;
}): Promise<{ ingestRunId: string }> {
  const prisma = getPrismaClient();

  const source = await prisma.source.findFirst({
    where: { id: input.sourceId },
    select: {
      id: true,
      enabled: true,
      allowedUse: true,
      attributionRequirements: true,
      lastVerifiedAt: true,
    },
  });
  if (!source) throw new Error('Source not found');
  if (!source.enabled) throw new Error('Source is disabled');
  if (!source.allowedUse.trim()) throw new Error('Source missing allowedUse');
  if (!source.attributionRequirements.trim()) throw new Error('Source missing attributionRequirements');
  if (!source.lastVerifiedAt) throw new Error('Source must be verified (lastVerifiedAt) before ingest');

  const maxItems = normalizeMaxItems(input.maxItems);

  const run = await prisma.ingestRun.create({
    data: {
      sourceId: source.id,
      startedAt: new Date(),
      status: 'RUNNING',
      triggeredBy: 'MANUAL',
      triggeredByUserId: input.actorUserId,
      configSnapshot: { maxItems },
    },
    select: { id: true, sourceId: true, startedAt: true, status: true, triggeredBy: true, configSnapshot: true },
  });

  await prisma.auditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      action: 'INGEST_RUN_CREATE',
      entityType: 'INGEST_RUN',
      entityId: run.id,
      after: toJsonSafe(run),
    },
  });

  const boss = await getBoss();
  await boss.send('ingest:run', { ingestRunId: run.id });

  return { ingestRunId: run.id };
}

type ProposedChangeCreateEntry = {
  kind: 'CREATE_ENTRY';
  entryType: 'TERM' | 'ACRONYM';
  displayTitle: string;
  primarySlug?: string;
  summaryMd: string;
  senses: Array<{
    senseLabel?: string;
    expandedForm?: string;
    definitionMd: string;
    extractionMethod?: string;
    extractorVersion?: string;
    sourceLocator?: unknown;
  }>;
};

function parseProposedChange(value: unknown): ProposedChangeCreateEntry {
  if (!value || typeof value !== 'object') throw new Error('Invalid proposedChange');
  const v = value as Record<string, unknown>;
  if (v.kind !== 'CREATE_ENTRY') throw new Error('Unsupported proposedChange.kind');
  const entryType = v.entryType === 'ACRONYM' ? 'ACRONYM' : 'TERM';
  const displayTitle = typeof v.displayTitle === 'string' ? v.displayTitle : '';
  const primarySlug = typeof v.primarySlug === 'string' ? v.primarySlug : undefined;
  const summaryMd = typeof v.summaryMd === 'string' ? v.summaryMd : '';
  const sensesRaw = Array.isArray(v.senses) ? v.senses : [];
  const senses = sensesRaw
    .map((s) => (s && typeof s === 'object' ? (s as Record<string, unknown>) : null))
    .filter((s): s is Record<string, unknown> => Boolean(s))
    .map((s) => ({
      senseLabel: typeof s.senseLabel === 'string' ? s.senseLabel : undefined,
      expandedForm: typeof s.expandedForm === 'string' ? s.expandedForm : undefined,
      definitionMd: typeof s.definitionMd === 'string' ? s.definitionMd : '',
      extractionMethod: typeof s.extractionMethod === 'string' ? s.extractionMethod : undefined,
      extractorVersion: typeof s.extractorVersion === 'string' ? s.extractorVersion : undefined,
      sourceLocator: s.sourceLocator,
    }));

  return {
    kind: 'CREATE_ENTRY',
    entryType,
    displayTitle,
    primarySlug,
    summaryMd,
    senses,
  };
}

function parseExtractionMethod(value: string | undefined): 'API' | 'RSS' | 'HTML' | 'PDF' | 'MANUAL' {
  const v = value?.toUpperCase();
  if (v === 'API' || v === 'RSS' || v === 'HTML' || v === 'PDF' || v === 'MANUAL') return v;
  return 'MANUAL';
}

export async function approveIngestItem(input: {
  actorUserId: string;
  ingestItemId: string;
}): Promise<{ entryId: string }> {
  const prisma = getPrismaClient();

  const item = await prisma.ingestItem.findFirst({
    where: { id: input.ingestItemId },
    select: {
      id: true,
      stage: true,
      licenseGate: true,
      proposedChange: true,
      ingestRunId: true,
      sourceDocumentId: true,
      ingestRun: { select: { sourceId: true } },
      sourceDocument: { select: { url: true, canonicalUrl: true, fetchedAt: true } },
    },
  });
  if (!item) throw new Error('Ingest item not found');
  if (item.licenseGate === 'FAIL') throw new Error('Cannot approve item with licenseGate=FAIL');
  if (item.stage !== 'VALIDATED' && item.stage !== 'REVIEWED') {
    throw new Error(`Cannot approve ingest item in stage ${item.stage}`);
  }

  const source = await prisma.source.findFirst({
    where: { id: item.ingestRun.sourceId },
    select: {
      id: true,
      name: true,
      licenseNotes: true,
      attributionRequirements: true,
      accessMethod: true,
    },
  });
  if (!source) throw new Error('Source not found');

  const proposed = parseProposedChange(item.proposedChange);
  if (!proposed.displayTitle.trim()) throw new Error('proposedChange.displayTitle is required');

  const firstSense = proposed.senses[0];
  if (!firstSense?.definitionMd?.trim()) throw new Error('proposedChange requires at least one sense definition');

  const { entryId } = await createDraftEntry({
    actorUserId: input.actorUserId,
    entryType: proposed.entryType,
    displayTitle: proposed.displayTitle,
    primarySlug: proposed.primarySlug,
  });

  await updateEntry({
    actorUserId: input.actorUserId,
    entryId,
    displayTitle: proposed.displayTitle,
    primarySlug: proposed.primarySlug ?? '',
    summaryMd: proposed.summaryMd ?? '',
    editorialNotes: '',
  });

  const senseIds: string[] = [];
  for (const sense of proposed.senses) {
    if (!sense.definitionMd.trim()) continue;
    const { senseId } = await createDraftSense({ actorUserId: input.actorUserId, entryId });
    senseIds.push(senseId);
    await updateSense({
      actorUserId: input.actorUserId,
      senseId,
      senseLabel: sense.senseLabel ?? '',
      expandedForm: sense.expandedForm ?? '',
      definitionMd: sense.definitionMd,
      isEditorial: false,
      editorialRationale: '',
    });
  }

  const citationUrl = item.sourceDocument.canonicalUrl ?? item.sourceDocument.url;
  const citation = await prisma.citation.create({
    data: {
      sourceId: source.id,
      sourceDocumentId: item.sourceDocumentId,
      url: citationUrl,
      citationText: source.name,
      licenseNote: source.licenseNotes,
      attributionText: source.attributionRequirements,
      accessedAt: item.sourceDocument.fetchedAt,
    },
    select: { id: true },
  });

  const extractionMethod = parseExtractionMethod(firstSense.extractionMethod ?? source.accessMethod);
  const extractorVersion = firstSense.extractorVersion?.trim() ? firstSense.extractorVersion.trim() : 'synac-web';

  const provenance: Array<{
    entityType: 'ENTRY' | 'SENSE';
    entityId: string;
    fieldName: string;
    citationId: string;
    extractionMethod: typeof extractionMethod;
    extractorVersion: string;
    extractedAt: Date;
  }> = [];

  if (proposed.summaryMd?.trim()) {
    provenance.push({
      entityType: 'ENTRY',
      entityId: entryId,
      fieldName: 'summaryMd',
      citationId: citation.id,
      extractionMethod,
      extractorVersion,
      extractedAt: item.sourceDocument.fetchedAt,
    });
  }

  for (const senseId of senseIds) {
    provenance.push({
      entityType: 'SENSE',
      entityId: senseId,
      fieldName: 'definitionMd',
      citationId: citation.id,
      extractionMethod,
      extractorVersion,
      extractedAt: item.sourceDocument.fetchedAt,
    });
  }

  await prisma.fieldProvenance.createMany({ data: provenance });

  await prisma.ingestItem.update({
    where: { id: item.id },
    data: {
      stage: 'APPLIED',
      diff: { appliedEntryId: entryId },
      error: null,
    },
  });

  await prisma.auditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      action: 'INGEST_ITEM_APPROVE',
      entityType: 'INGEST_ITEM',
      entityId: item.id,
      after: { appliedEntryId: entryId },
    },
  });

  return { entryId };
}

export async function rejectIngestItem(input: {
  actorUserId: string;
  ingestItemId: string;
  reason: string;
}): Promise<void> {
  const prisma = getPrismaClient();

  const reason = input.reason.trim();
  if (!reason) throw new Error('reason is required');

  await prisma.ingestItem.update({
    where: { id: input.ingestItemId },
    data: {
      stage: 'REJECTED',
      error: reason,
    },
  });

  await prisma.auditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      action: 'INGEST_ITEM_REJECT',
      entityType: 'INGEST_ITEM',
      entityId: input.ingestItemId,
      after: toJsonSafe({ reason }),
    },
  });
}
