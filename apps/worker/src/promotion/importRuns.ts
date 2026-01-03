import type { Prisma, PrismaClient } from '@synac/db';

import type { ProposedChange } from './types.js';

function getNormalizedProposedChange(item: {
  proposedChange: unknown;
  stageOutputs: unknown;
}): ProposedChange | null {
  const stageOutputs = item.stageOutputs;
  if (stageOutputs && typeof stageOutputs === 'object') {
    const normalized = (stageOutputs as Record<string, unknown>).normalized;
    if (normalized && typeof normalized === 'object') {
      const proposed = (normalized as Record<string, unknown>).proposedChange;
      if (proposed && typeof proposed === 'object') {
        const kind = (proposed as Record<string, unknown>).kind;
        if (kind === 'CREATE_ENTRY' || kind === 'ADD_SENSES') {
          return proposed as ProposedChange;
        }
      }
    }
  }

  if (item.proposedChange && typeof item.proposedChange === 'object') {
    const kind = (item.proposedChange as Record<string, unknown>).kind;
    if (kind === 'CREATE_ENTRY' || kind === 'ADD_SENSES') {
      return item.proposedChange as ProposedChange;
    }
  }

  return null;
}

function withoutDeduped(stageOutputs: unknown): Prisma.InputJsonValue | undefined {
  if (!stageOutputs || typeof stageOutputs !== 'object') return undefined;
  const v = stageOutputs as Record<string, unknown>;
  const { deduped: _deduped, ...rest } = v;
  return rest as Prisma.InputJsonValue;
}

async function getOrCreateSourceDocument(
  prod: PrismaClient,
  input: {
    prodSourceId: string;
    url: string;
    canonicalUrl: string | null;
    title: string | null;
    contentType: string;
    etag: string | null;
    lastModified: string | null;
    fetchedAt: Date;
    contentSha256: string;
    snapshotAllowed: boolean;
    snapshotStorageUri: string | null;
  },
): Promise<string> {
  const existing = await prod.sourceDocument.findFirst({
    where: { sourceId: input.prodSourceId, url: input.url, contentSha256: input.contentSha256 },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prod.sourceDocument.create({
    data: {
      sourceId: input.prodSourceId,
      url: input.url,
      canonicalUrl: input.canonicalUrl,
      title: input.title,
      contentType: input.contentType,
      etag: input.etag,
      lastModified: input.lastModified,
      fetchedAt: input.fetchedAt,
      contentSha256: input.contentSha256,
      snapshotAllowed: input.snapshotAllowed,
      snapshotStorageUri: input.snapshotStorageUri,
    },
    select: { id: true },
  });

  return created.id;
}

export async function importEligibleStagingRuns(
  prod: PrismaClient,
  staging: PrismaClient,
  input: { maxRuns: number; maxItemsPerRun: number },
): Promise<{ runsImported: number; itemsImported: number }> {
  const runs = await staging.ingestRun.findMany({
    where: { status: 'SUCCESS', finishedAt: { not: null } },
    select: {
      id: true,
      startedAt: true,
      finishedAt: true,
      status: true,
      triggeredBy: true,
      configSnapshot: true,
      stats: true,
      source: { select: { sourceSlug: true } },
    },
    orderBy: [{ finishedAt: 'desc' }],
    take: Math.max(1, Math.min(50, input.maxRuns)),
  });

  let runsImported = 0;
  let itemsImported = 0;

  for (const run of runs) {
    const prodSource = await prod.source.findFirst({
      where: { sourceSlug: run.source.sourceSlug },
      select: { id: true },
    });
    if (!prodSource) continue;

    await prod.ingestRun.upsert({
      where: { id: run.id },
      update: {
        sourceId: prodSource.id,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        status: 'SUCCESS',
        triggeredBy: run.triggeredBy,
        triggeredByUserId: null,
        configSnapshot: run.configSnapshot as Prisma.InputJsonValue,
        stats: {
          ...(run.stats && typeof run.stats === 'object' ? (run.stats as Record<string, unknown>) : {}),
          promotedFrom: { environment: 'staging', promotedAt: new Date().toISOString() },
        } satisfies Prisma.InputJsonValue,
      },
      create: {
        id: run.id,
        sourceId: prodSource.id,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        status: 'SUCCESS',
        triggeredBy: run.triggeredBy,
        triggeredByUserId: null,
        configSnapshot: run.configSnapshot as Prisma.InputJsonValue,
        stats: {
          ...(run.stats && typeof run.stats === 'object' ? (run.stats as Record<string, unknown>) : {}),
          promotedFrom: { environment: 'staging', promotedAt: new Date().toISOString() },
        } satisfies Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    const items = await staging.ingestItem.findMany({
      where: {
        ingestRunId: run.id,
        stage: { in: ['VALIDATED', 'REVIEWED'] },
        licenseGate: { not: 'FAIL' },
      },
      select: {
        id: true,
        itemKey: true,
        stage: true,
        proposedChange: true,
        stageOutputs: true,
        confidenceScore: true,
        licenseGate: true,
        licenseGateReason: true,
        error: true,
        sourceDocument: {
          select: {
            url: true,
            canonicalUrl: true,
            title: true,
            contentType: true,
            etag: true,
            lastModified: true,
            fetchedAt: true,
            contentSha256: true,
            snapshotAllowed: true,
            snapshotStorageUri: true,
            doNotUse: true,
          },
        },
      },
      orderBy: [{ id: 'asc' }],
      take: Math.max(1, Math.min(2000, input.maxItemsPerRun)),
    });

    for (const item of items) {
      const existingItem = await prod.ingestItem.findFirst({ where: { id: item.id }, select: { id: true } });
      if (existingItem) continue;
      if (item.sourceDocument.doNotUse) continue;
      if (item.error?.trim()) continue;

      const normalizedProposedChange = getNormalizedProposedChange(item);
      if (!normalizedProposedChange) continue;

      const prodSourceDocumentId = await getOrCreateSourceDocument(prod, {
        prodSourceId: prodSource.id,
        url: item.sourceDocument.url,
        canonicalUrl: item.sourceDocument.canonicalUrl,
        title: item.sourceDocument.title,
        contentType: item.sourceDocument.contentType,
        etag: item.sourceDocument.etag,
        lastModified: item.sourceDocument.lastModified,
        fetchedAt: item.sourceDocument.fetchedAt,
        contentSha256: item.sourceDocument.contentSha256,
        snapshotAllowed: item.sourceDocument.snapshotAllowed,
        snapshotStorageUri: item.sourceDocument.snapshotStorageUri,
      });

      const stageOutputs = withoutDeduped(item.stageOutputs);
      const promotedStageOutputs = {
        ...(stageOutputs && typeof stageOutputs === 'object' ? (stageOutputs as Record<string, unknown>) : {}),
        promotedFrom: { environment: 'staging', stagingIngestItemId: item.id },
      } satisfies Prisma.InputJsonValue;

      await prod.ingestItem.create({
        data: {
          id: item.id,
          ingestRunId: run.id,
          sourceDocumentId: prodSourceDocumentId,
          itemKey: item.itemKey,
          stage: 'VALIDATED',
          proposedChange: normalizedProposedChange as Prisma.InputJsonValue,
          stageOutputs: promotedStageOutputs,
          confidenceScore: item.confidenceScore,
          licenseGate: item.licenseGate,
          licenseGateReason: item.licenseGateReason,
          error: null,
        },
        select: { id: true },
      });

      itemsImported += 1;
    }

    runsImported += 1;
  }

  return { runsImported, itemsImported };
}
