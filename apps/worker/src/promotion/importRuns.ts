import type { Prisma, PrismaClient } from '@synac/db';

/**
 * Prisma hands back `Json` columns as `Prisma.JsonValue`. Narrowing to an
 * object happens here once per read so the promotion logic below works with
 * keyed values rather than repeating `typeof` checks.
 */
function asJsonObject(
  value: Prisma.JsonValue | undefined,
): Prisma.JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
}

function isSupportedProposedChange(
  value: Prisma.JsonObject | null,
): value is Prisma.JsonObject {
  return value?.kind === 'CREATE_ENTRY' || value?.kind === 'ADD_SENSES';
}

/**
 * Staging records the normalized proposal under `stageOutputs.normalized`; the
 * item's own `proposedChange` column is the fallback for rows written before
 * that stage existed.
 */
function extractNormalizedProposedChange(item: {
  proposedChange: Prisma.JsonValue;
  stageOutputs: Prisma.JsonValue;
}): Prisma.JsonObject | null {
  const normalized = asJsonObject(asJsonObject(item.stageOutputs)?.normalized);
  const fromStageOutputs = asJsonObject(normalized?.proposedChange);
  if (isSupportedProposedChange(fromStageOutputs)) return fromStageOutputs;

  const fromColumn = asJsonObject(item.proposedChange);
  if (isSupportedProposedChange(fromColumn)) return fromColumn;

  return null;
}

/** `deduped` is staging bookkeeping and carries no meaning in prod. */
function withoutDeduped(stageOutputs: Prisma.JsonValue): Prisma.JsonObject {
  const rest = { ...asJsonObject(stageOutputs) };
  delete rest.deduped;
  return rest;
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
    where: {
      sourceId: input.prodSourceId,
      url: input.url,
      contentSha256: input.contentSha256,
    },
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

    // Prisma types a Json write as `InputJsonValue`, which excludes `null`, yet the
    // runtime accepts a plain `null` and writes SQL NULL. `Prisma.DbNull` is not
    // reachable here because `@synac/db` re-exports `Prisma` as a type only, so the
    // snapshot is passed through unchanged rather than being rewritten to `{}`.
    const configSnapshot = run.configSnapshot as Prisma.InputJsonValue;
    const promotedStats: Prisma.JsonObject = {
      ...asJsonObject(run.stats),
      promotedFrom: {
        environment: 'staging',
        promotedAt: new Date().toISOString(),
      },
    };

    await prod.ingestRun.upsert({
      where: { id: run.id },
      update: {
        sourceId: prodSource.id,
        finishedAt: run.finishedAt,
        status: 'SUCCESS',
        configSnapshot,
        stats: promotedStats,
      },
      create: {
        id: run.id,
        sourceId: prodSource.id,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        status: 'SUCCESS',
        triggeredBy: run.triggeredBy,
        triggeredByUserId: null,
        configSnapshot,
        stats: promotedStats,
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
      if (item.sourceDocument.doNotUse) continue;
      if (item.error?.trim()) continue;

      const proposedChange = extractNormalizedProposedChange(item);
      if (!proposedChange) continue;

      const existingItem = await prod.ingestItem.findFirst({
        where: { id: item.id },
        select: { id: true },
      });
      if (existingItem) continue;

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

      await prod.ingestItem.create({
        data: {
          id: item.id,
          ingestRunId: run.id,
          sourceDocumentId: prodSourceDocumentId,
          itemKey: item.itemKey,
          stage: 'VALIDATED',
          proposedChange,
          stageOutputs: {
            ...withoutDeduped(item.stageOutputs),
            promotedFrom: {
              environment: 'staging',
              stagingIngestItemId: item.id,
            },
          },
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
