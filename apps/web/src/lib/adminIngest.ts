import { randomUUID } from 'node:crypto';

import { getPrismaClient, getPrismaClientForUrl, type Prisma } from '@synac/db';

import { getBoss, getBossForDatabaseUrl } from '@/lib/boss';
import { createDraftEntry, createDraftSense, updateEntry, updateSense } from '@/lib/adminEntries';
import { normalizeTitle } from '@/lib/text';

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
  forceReprocess: boolean;
}): Promise<{ ingestRunId: string }> {
  const prisma = getPrismaClient();

  const source = await prisma.source.findFirst({
    where: { id: input.sourceId },
    select: {
      id: true,
      sourceSlug: true,
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
  const forceReprocess = Boolean(input.forceReprocess);

  const stagingDatabaseUrl = process.env.SYNAC_STAGING_DATABASE_URL?.trim();
  if (stagingDatabaseUrl) {
    const staging = getPrismaClientForUrl(stagingDatabaseUrl);

    const stagingSource = await staging.source.findFirst({
      where: { sourceSlug: source.sourceSlug },
      select: { id: true, enabled: true, allowedUse: true, attributionRequirements: true, lastVerifiedAt: true },
    });
    if (!stagingSource) {
      throw new Error(`Staging source not found (sourceSlug=${source.sourceSlug}). Wait for promotion sync.`);
    }
    if (!stagingSource.enabled) throw new Error('Staging source is disabled');
    if (!stagingSource.allowedUse.trim()) throw new Error('Staging source missing allowedUse');
    if (!stagingSource.attributionRequirements.trim()) throw new Error('Staging source missing attributionRequirements');
    if (!stagingSource.lastVerifiedAt) throw new Error('Staging source must be verified (lastVerifiedAt) before ingest');

    const runId = randomUUID();
    const now = new Date();

    await staging.ingestRun.create({
      data: {
        id: runId,
        sourceId: stagingSource.id,
        startedAt: now,
        status: 'RUNNING',
        triggeredBy: 'MANUAL',
        triggeredByUserId: null,
        configSnapshot: { maxItems, forceReprocess },
      },
      select: { id: true },
    });

    const mirrored = await prisma.ingestRun.create({
      data: {
        id: runId,
        sourceId: source.id,
        startedAt: now,
        status: 'RUNNING',
        triggeredBy: 'MANUAL',
        triggeredByUserId: input.actorUserId,
        configSnapshot: { maxItems, forceReprocess },
        stats: { stagingFirst: true, stagingSourceSlug: source.sourceSlug },
      },
      select: { id: true, sourceId: true, startedAt: true, status: true, triggeredBy: true, configSnapshot: true },
    });

    await prisma.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        action: 'INGEST_RUN_CREATE',
        entityType: 'INGEST_RUN',
        entityId: mirrored.id,
        after: toJsonSafe(mirrored),
      },
    });

    const stagingBoss = await getBossForDatabaseUrl(stagingDatabaseUrl);
    await stagingBoss.send('ingest_run', { ingestRunId: runId });

    return { ingestRunId: runId };
  }

  const run = await prisma.ingestRun.create({
    data: {
      sourceId: source.id,
      startedAt: new Date(),
      status: 'RUNNING',
      triggeredBy: 'MANUAL',
      triggeredByUserId: input.actorUserId,
      configSnapshot: { maxItems, forceReprocess },
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
  await boss.send('ingest_run', { ingestRunId: run.id });

  return { ingestRunId: run.id };
}

export async function createIngestRunsForAllSources(input: {
  actorUserId: string;
  maxItems: number;
  forceReprocess: boolean;
}): Promise<{ ingestRunIds: string[] }> {
  const prisma = getPrismaClient();

  const sources = await prisma.source.findMany({
    where: { enabled: true },
    select: { id: true },
    orderBy: [{ name: 'asc' }],
  });

  const ingestRunIds: string[] = [];
  for (const source of sources) {
    const { ingestRunId } = await createIngestRun({
      actorUserId: input.actorUserId,
      sourceId: source.id,
      maxItems: input.maxItems,
      forceReprocess: input.forceReprocess,
    });
    ingestRunIds.push(ingestRunId);
  }

  return { ingestRunIds };
}

type ProposedChangeCreateEntry = {
  kind: 'CREATE_ENTRY';
  entryType: 'TERM' | 'ACRONYM';
  displayTitle: string;
  primarySlug?: string;
  summaryMd: string;
  variants?: Array<{ variantText: string; variantType: 'ALIAS' | 'SYNONYM' | 'ABBREVIATION' | 'MISSPELLING' }>;
  senses: Array<{
    senseLabel?: string;
    expandedForm?: string;
    definitionMd: string;
    contentMode?: string;
    extractionMethod?: string;
    extractorVersion?: string;
    sourceLocator?: unknown;
  }>;
};

type ProposedChangeAddSenses = {
  kind: 'ADD_SENSES';
  entryId: string;
  entryType: 'TERM' | 'ACRONYM';
  displayTitle: string;
  summaryMd?: string;
  variants?: ProposedChangeCreateEntry['variants'];
  senses: ProposedChangeCreateEntry['senses'];
};

type ProposedChange = ProposedChangeCreateEntry | ProposedChangeAddSenses;

function parseVariantType(value: unknown): 'ALIAS' | 'SYNONYM' | 'ABBREVIATION' | 'MISSPELLING' {
  if (value === 'SYNONYM' || value === 'ABBREVIATION' || value === 'MISSPELLING') return value;
  return 'ALIAS';
}

function parseProposedChange(value: unknown): ProposedChange {
  if (!value || typeof value !== 'object') throw new Error('Invalid proposedChange');
  const v = value as Record<string, unknown>;
  if (v.kind !== 'CREATE_ENTRY' && v.kind !== 'ADD_SENSES') throw new Error('Unsupported proposedChange.kind');
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
      contentMode: typeof s.contentMode === 'string' ? s.contentMode : undefined,
      extractionMethod: typeof s.extractionMethod === 'string' ? s.extractionMethod : undefined,
      extractorVersion: typeof s.extractorVersion === 'string' ? s.extractorVersion : undefined,
      sourceLocator: s.sourceLocator,
    }));

  const variantsRaw = Array.isArray(v.variants) ? v.variants : [];
  const variants = variantsRaw
    .map((variant) => (variant && typeof variant === 'object' ? (variant as Record<string, unknown>) : null))
    .filter((variant): variant is Record<string, unknown> => Boolean(variant))
    .map((variant) => ({
      variantText: typeof variant.variantText === 'string' ? variant.variantText.trim() : '',
      variantType: parseVariantType(variant.variantType),
    }))
    .filter((variant) => Boolean(variant.variantText));

  if (v.kind === 'ADD_SENSES') {
    const entryId = typeof v.entryId === 'string' ? v.entryId : '';
    return {
      kind: 'ADD_SENSES',
      entryId,
      entryType,
      displayTitle,
      summaryMd: summaryMd || undefined,
      ...(variants.length ? { variants } : {}),
      senses,
    };
  }

  return {
    kind: 'CREATE_ENTRY',
    entryType,
    displayTitle,
    primarySlug,
    summaryMd,
    ...(variants.length ? { variants } : {}),
    senses,
  };
}

function parseExtractionMethod(value: string | undefined): 'API' | 'RSS' | 'HTML' | 'PDF' | 'MANUAL' {
  const v = value?.toUpperCase();
  if (v === 'API' || v === 'RSS' || v === 'HTML' || v === 'PDF' || v === 'MANUAL') return v;
  return 'MANUAL';
}

function parseContentMode(value: string | undefined): 'QUOTED' | 'SUMMARIZED' | 'PARAPHRASED' {
  const v = value?.toUpperCase();
  if (v === 'QUOTED' || v === 'SUMMARIZED' || v === 'PARAPHRASED') return v;
  return 'SUMMARIZED';
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
      sourceDocument: {
        select: { url: true, canonicalUrl: true, fetchedAt: true, doNotUse: true, doNotUseReason: true },
      },
    },
  });
  if (!item) throw new Error('Ingest item not found');
  if (item.licenseGate === 'FAIL') throw new Error('Cannot approve item with licenseGate=FAIL');
  if (item.sourceDocument.doNotUse) {
    const reason = item.sourceDocument.doNotUseReason?.trim() ? `: ${item.sourceDocument.doNotUseReason}` : '';
    throw new Error(`Cannot approve item from do-not-use SourceDocument${reason}`);
  }
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
  const normalizedEntryTitle = normalizeTitle(proposed.displayTitle);

  if (proposed.kind === 'ADD_SENSES' && !proposed.entryId.trim()) {
    throw new Error('proposedChange.entryId is required for ADD_SENSES');
  }

  const firstSense = proposed.senses[0];
  if (!firstSense?.definitionMd?.trim()) throw new Error('proposedChange requires at least one sense definition');

  let entryId: string;
  if (proposed.kind === 'CREATE_ENTRY') {
    const created = await createDraftEntry({
      actorUserId: input.actorUserId,
      entryType: proposed.entryType,
      displayTitle: proposed.displayTitle,
      primarySlug: proposed.primarySlug,
    });
    entryId = created.entryId;

    await updateEntry({
      actorUserId: input.actorUserId,
      entryId,
      displayTitle: proposed.displayTitle,
      primarySlug: proposed.primarySlug ?? '',
      summaryMd: proposed.summaryMd ?? '',
      editorialNotes: '',
    });
  } else {
    const existing = await prisma.entry.findFirst({
      where: { id: proposed.entryId, deletedAt: null },
      select: { id: true, entryType: true },
    });
    if (!existing) throw new Error('Entry not found for ADD_SENSES');
    if (existing.entryType !== proposed.entryType) {
      throw new Error('proposedChange.entryType does not match existing entry type');
    }
    entryId = existing.id;
  }

  const appliedSenses: Array<{ senseId: string; sense: ProposedChangeCreateEntry['senses'][number] }> = [];
  for (const sense of proposed.senses) {
    if (!sense.definitionMd.trim()) continue;
    const { senseId } = await createDraftSense({ actorUserId: input.actorUserId, entryId });
    appliedSenses.push({ senseId, sense });
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
  const existingCitation = await prisma.citation.findFirst({
    where: { sourceId: source.id, sourceDocumentId: item.sourceDocumentId, url: citationUrl },
    select: { id: true },
  });

  const citation =
    existingCitation ??
    (await prisma.citation.create({
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
    }));

  const extractionMethod = parseExtractionMethod(firstSense.extractionMethod ?? source.accessMethod);
  const extractorVersion = firstSense.extractorVersion?.trim() ? firstSense.extractorVersion.trim() : 'synac-web';
  const contentMode = parseContentMode(firstSense.contentMode);

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

  if (proposed.kind === 'CREATE_ENTRY' && proposed.summaryMd?.trim()) {
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

  for (const { senseId, sense } of appliedSenses) {
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

  await prisma.fieldProvenance.createMany({ data: provenance });
  const appliedSenseIds = appliedSenses.map((s) => s.senseId);

  const variantsToCreate = (proposed.variants ?? [])
    .map((v) => ({ variantText: v.variantText.trim(), variantType: v.variantType }))
    .filter((v) => v.variantText.length > 0 && normalizeTitle(v.variantText) !== normalizedEntryTitle)
    .map((v) => ({
      entryId,
      variantText: v.variantText,
      normalizedVariant: normalizeTitle(v.variantText),
      variantType: v.variantType,
    }));

  if (variantsToCreate.length) {
    await prisma.entryVariant.createMany({ data: variantsToCreate, skipDuplicates: true });
  }

  await prisma.ingestItem.update({
    where: { id: item.id },
    data: {
      stage: 'APPLIED',
      diff: { appliedEntryId: entryId, appliedSenseIds },
      error: null,
    },
  });

  await prisma.auditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      action: 'INGEST_ITEM_APPROVE',
      entityType: 'INGEST_ITEM',
      entityId: item.id,
      after: { appliedEntryId: entryId, appliedSenseIds },
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
