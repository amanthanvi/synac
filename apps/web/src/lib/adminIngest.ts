import { randomUUID } from 'node:crypto';

import {
  applyProposedChange,
  getPrismaClient,
  getPrismaClientForUrl,
  toJsonSafe,
} from '@synac/db';

import { publishEntry } from '@/lib/adminEntries';
import { getBoss, getBossForDatabaseUrl } from '@/lib/boss';
import { proposedChangeSchema, sourceLocatorSchema } from '@/lib/validation';

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
  if (!source.attributionRequirements.trim())
    throw new Error('Source missing attributionRequirements');
  if (!source.lastVerifiedAt)
    throw new Error('Source must be verified (lastVerifiedAt) before ingest');

  const maxItems = normalizeMaxItems(input.maxItems);
  const forceReprocess = Boolean(input.forceReprocess);

  const stagingDatabaseUrl = process.env.SYNAC_STAGING_DATABASE_URL?.trim();
  if (stagingDatabaseUrl) {
    const staging = getPrismaClientForUrl(stagingDatabaseUrl);

    const stagingSource = await staging.source.findFirst({
      where: { sourceSlug: source.sourceSlug },
      select: {
        id: true,
        enabled: true,
        allowedUse: true,
        attributionRequirements: true,
        lastVerifiedAt: true,
      },
    });
    if (!stagingSource) {
      throw new Error(
        `Staging source not found (sourceSlug=${source.sourceSlug}). Wait for promotion sync.`,
      );
    }
    if (!stagingSource.enabled) throw new Error('Staging source is disabled');
    if (!stagingSource.allowedUse.trim())
      throw new Error('Staging source missing allowedUse');
    if (!stagingSource.attributionRequirements.trim())
      throw new Error('Staging source missing attributionRequirements');
    if (!stagingSource.lastVerifiedAt)
      throw new Error(
        'Staging source must be verified (lastVerifiedAt) before ingest',
      );

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
      select: {
        id: true,
        sourceId: true,
        startedAt: true,
        status: true,
        triggeredBy: true,
        configSnapshot: true,
      },
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
    select: {
      id: true,
      sourceId: true,
      startedAt: true,
      status: true,
      triggeredBy: true,
      configSnapshot: true,
    },
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

/**
 * Approve a reviewed ingest item.
 *
 * The gates here are the licence gates: everything about whether this
 * material may be published. The actual write is delegated to
 * `applyProposedChange` in @synac/db, which is the single apply path shared
 * with the worker's auto-apply: keeping one implementation is what makes
 * "approved by a human" and "auto-applied" produce identical rows, including
 * the sense-attachment and `needsLabel` decisions.
 */
export async function approveIngestItem(input: {
  actorUserId: string;
  ingestItemId: string;
  attachThreshold?: number;
}): Promise<{
  entryId: string;
  appliedSenseIds: string[];
  createdSenseIds: string[];
  attachedSenseIds: string[];
  needsLabelSenseIds: string[];
  citationId: string;
  published: boolean;
  publishBlockedReason?: string;
}> {
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
        select: {
          url: true,
          canonicalUrl: true,
          fetchedAt: true,
          doNotUse: true,
          doNotUseReason: true,
        },
      },
    },
  });
  if (!item) throw new Error('Ingest item not found');
  if (item.licenseGate === 'FAIL')
    throw new Error('Cannot approve item with licenseGate=FAIL');
  if (item.sourceDocument.doNotUse) {
    const reason = item.sourceDocument.doNotUseReason?.trim()
      ? `: ${item.sourceDocument.doNotUseReason}`
      : '';
    throw new Error(
      `Cannot approve item from do-not-use SourceDocument${reason}`,
    );
  }
  if (item.stage !== 'VALIDATED' && item.stage !== 'REVIEWED') {
    throw new Error(`Cannot approve ingest item in stage ${item.stage}`);
  }

  const source = await prisma.source.findFirst({
    where: { id: item.ingestRun.sourceId },
    select: { id: true, name: true },
  });
  if (!source) throw new Error('Source not found');

  // `proposedChange` and each `sourceLocator` are JSON we are about to persist
  // into typed columns. Validate before delegating: `applyProposedChange` reads
  // the row itself, so this is the last point at which a malformed proposal can
  // be rejected with a message an editor can act on rather than a Prisma error.
  const parsed = proposedChangeSchema.safeParse(item.proposedChange);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path?.length ? ` at ${first.path.join('.')}` : '';
    throw new Error(
      `Invalid proposedChange${where}: ${first?.message ?? 'failed validation'}`,
    );
  }

  const proposed = parsed.data;

  proposed.senses.forEach((sense, index) => {
    if (sense.sourceLocator === undefined || sense.sourceLocator === null)
      return;
    const locator = sourceLocatorSchema.safeParse(sense.sourceLocator);
    if (!locator.success) {
      throw new Error(`Invalid sourceLocator on sense ${index + 1}`);
    }
  });

  if (!proposed.senses.some((sense) => sense.definitionMd.trim())) {
    throw new Error('proposedChange requires at least one sense definition');
  }

  const applyInput: Parameters<typeof applyProposedChange>[1] = {
    actorUserId: input.actorUserId,
    ingestItemId: item.id,
  };
  if (input.attachThreshold !== undefined)
    applyInput.attachThreshold = input.attachThreshold;

  const applied = await applyProposedChange(prisma, applyInput);

  await prisma.$transaction(async (tx) => {
    await tx.ingestItem.update({
      where: { id: item.id },
      data: {
        stage: 'APPLIED',
        diff: toJsonSafe({
          appliedEntryId: applied.entryId,
          appliedSenseIds: applied.appliedSenseIds,
          createdSenseIds: applied.createdSenseIds,
          attachedSenseIds: applied.attachedSenseIds,
          needsLabelSenseIds: applied.needsLabelSenseIds,
          citationId: applied.citationId,
        }),
        error: null,
      },
    });

    await tx.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        action: 'INGEST_ITEM_APPROVE',
        entityType: 'INGEST_ITEM',
        entityId: item.id,
        after: toJsonSafe({ ...applied, sourceName: source.name }),
      },
    });
  });

  // Publishing is a separate decision with its own preconditions (a summary,
  // and a citation per sense). The item stays APPLIED either way: an approved
  // item that cannot yet publish is a normal editorial state, not a failure to
  // roll back.
  try {
    await publishEntry({
      actorUserId: input.actorUserId,
      entryId: applied.entryId,
    });
    return { ...applied, published: true };
  } catch (error) {
    return {
      ...applied,
      published: false,
      publishBlockedReason:
        error instanceof Error ? error.message : 'Publish failed',
    };
  }
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
