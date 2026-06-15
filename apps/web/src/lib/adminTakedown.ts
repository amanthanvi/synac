import { getPrismaClient, type InputJsonValue } from '@synac/db';

function toJsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toInputJson(value: unknown): InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as InputJsonValue;
}

function parseActions(value: unknown): Array<Record<string, unknown>> {
  if (!value) return [];
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null))
    .filter((v): v is Record<string, unknown> => Boolean(v));
}

export async function markSourceDocumentDoNotUse(input: {
  actorUserId: string;
  sourceDocumentId: string;
  reason: string;
}): Promise<void> {
  const prisma = getPrismaClient();
  const reason = input.reason.trim();
  if (!reason) throw new Error('reason is required');

  const before = await prisma.sourceDocument.findFirst({
    where: { id: input.sourceDocumentId },
    select: { id: true, doNotUse: true, doNotUseReason: true, doNotUseAt: true, doNotUseByUserId: true },
  });
  if (!before) throw new Error('SourceDocument not found');

  const after = await prisma.sourceDocument.update({
    where: { id: before.id },
    data: {
      doNotUse: true,
      doNotUseReason: reason,
      doNotUseAt: new Date(),
      doNotUseByUserId: input.actorUserId,
    },
    select: { id: true, doNotUse: true, doNotUseReason: true, doNotUseAt: true, doNotUseByUserId: true },
  });

  await prisma.auditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      action: 'SOURCE_DOCUMENT_DO_NOT_USE',
      entityType: 'SOURCE_DOCUMENT',
      entityId: before.id,
      before: toJsonSafe(before),
      after: toJsonSafe(after),
    },
  });
}

export async function purgeDerivedContentForSourceDocument(input: {
  actorUserId: string;
  sourceDocumentId: string;
}): Promise<{
  sensesArchived: number;
  entriesUpdated: number;
  entriesArchived: number;
  senseIdsArchived: string[];
  entryIdsSummaryCleared: string[];
  entryIdsArchived: string[];
}> {
  const prisma = getPrismaClient();
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const provenance = await tx.fieldProvenance.findMany({
      where: { citation: { sourceDocumentId: input.sourceDocumentId } },
      select: { entityType: true, entityId: true, fieldName: true },
    });

    const senseIds = new Set<string>();
    const entryIdsWithSummary = new Set<string>();
    for (const p of provenance) {
      if (p.entityType === 'SENSE') {
        senseIds.add(p.entityId);
      } else if (p.entityType === 'ENTRY' && p.fieldName === 'summaryMd') {
        entryIdsWithSummary.add(p.entityId);
      }
    }

    const senses = senseIds.size
      ? await tx.sense.findMany({
          where: { id: { in: Array.from(senseIds) }, deletedAt: null },
          select: { id: true, entryId: true },
        })
      : [];

    const sensesArchivedRes = await tx.sense.updateMany({
      where: { id: { in: senses.map((s) => s.id) }, deletedAt: null },
      data: { deletedAt: now, status: 'ARCHIVED' },
    });

    const entryIdsSummaryCleared = Array.from(entryIdsWithSummary);
    const entriesUpdatedRes = await tx.entry.updateMany({
      where: { id: { in: entryIdsSummaryCleared }, deletedAt: null },
      data: { summaryMd: null, summaryText: null },
    });

    const affectedEntryIds = Array.from(new Set(senses.map((s) => s.entryId)));
    const entriesToArchive: string[] = [];

    for (const entryId of affectedEntryIds) {
      const remaining = await tx.sense.count({ where: { entryId, deletedAt: null } });
      if (remaining === 0) entriesToArchive.push(entryId);
    }

    const entriesArchivedRes = entriesToArchive.length
      ? await tx.entry.updateMany({
          where: { id: { in: entriesToArchive }, status: 'PUBLISHED', deletedAt: null },
          data: { status: 'ARCHIVED' },
        })
      : { count: 0 };

    const senseIdsArchived = senses.map((s) => s.id);
    const entryIdsArchived = entriesToArchive;

    const docBefore = await tx.sourceDocument.findFirst({
      where: { id: input.sourceDocumentId },
      select: { id: true, doNotUse: true, doNotUseReason: true, doNotUseAt: true, doNotUseByUserId: true },
    });
    if (docBefore) {
      await tx.sourceDocument.update({
        where: { id: docBefore.id },
        data: {
          doNotUse: true,
          doNotUseAt: docBefore.doNotUseAt ?? now,
          doNotUseByUserId: docBefore.doNotUseByUserId ?? input.actorUserId,
          doNotUseReason: docBefore.doNotUseReason ?? 'Purged derived content',
        },
        select: { id: true },
      });

      await tx.auditEvent.create({
        data: {
          actorUserId: input.actorUserId,
          action: 'TAKEDOWN_PURGE_SOURCE_DOCUMENT',
          entityType: 'SOURCE_DOCUMENT',
          entityId: docBefore.id,
          after: toJsonSafe({
            sensesArchived: sensesArchivedRes.count,
            entriesUpdated: entriesUpdatedRes.count,
            entriesArchived: entriesArchivedRes.count,
            senseIdsArchived,
            entryIdsSummaryCleared,
            entryIdsArchived,
          }),
        },
      });
    }

    return {
      sensesArchived: sensesArchivedRes.count,
      entriesUpdated: entriesUpdatedRes.count,
      entriesArchived: entriesArchivedRes.count,
      senseIdsArchived,
      entryIdsSummaryCleared,
      entryIdsArchived,
    };
  });
}

export async function createTakedownCase(input: {
  actorUserId: string;
  status?: 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
  sourceId?: string;
  sourceDocumentId?: string;
  entryId?: string;
  requesterContact?: string;
  requestText: string;
  internalNotes?: string;
}): Promise<{ takedownCaseId: string }> {
  const prisma = getPrismaClient();

  const requestText = input.requestText.trim();
  if (!requestText) throw new Error('requestText is required');

  const created = await prisma.takedownCase.create({
    data: {
      status: input.status ?? 'OPEN',
      sourceId: input.sourceId?.trim() ? input.sourceId.trim() : null,
      sourceDocumentId: input.sourceDocumentId?.trim() ? input.sourceDocumentId.trim() : null,
      entryId: input.entryId?.trim() ? input.entryId.trim() : null,
      requesterContact: input.requesterContact?.trim() ? input.requesterContact.trim() : null,
      requestText,
      internalNotes: input.internalNotes?.trim() ? input.internalNotes.trim() : null,
      createdByUserId: input.actorUserId,
      actions: [],
      affectedEntityIds: [],
      closedAt: input.status === 'CLOSED' ? new Date() : null,
    },
    select: { id: true, status: true, sourceId: true, sourceDocumentId: true, entryId: true },
  });

  await prisma.auditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      action: 'TAKEDOWN_CASE_CREATE',
      entityType: 'TAKEDOWN_CASE',
      entityId: created.id,
      after: toJsonSafe(created),
    },
  });

  return { takedownCaseId: created.id };
}

export async function updateTakedownCase(input: {
  actorUserId: string;
  takedownCaseId: string;
  status?: 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
  internalNotes?: string;
  appendAction?: string;
  affectedEntityIds?: InputJsonValue;
}): Promise<void> {
  const prisma = getPrismaClient();

  const before = await prisma.takedownCase.findFirst({
    where: { id: input.takedownCaseId },
    select: { id: true, status: true, internalNotes: true, actions: true, affectedEntityIds: true, closedAt: true },
  });
  if (!before) throw new Error('Takedown case not found');

  const actions = parseActions(before.actions);
  const append = input.appendAction?.trim();
  if (append) {
    actions.push({ at: new Date().toISOString(), actorUserId: input.actorUserId, note: append });
  }

  const internalNotes = (() => {
    if (input.internalNotes === undefined) return before.internalNotes;
    const trimmed = input.internalNotes.trim();
    return trimmed ? trimmed : null;
  })();

  const status = input.status ?? before.status;
  const after = await prisma.takedownCase.update({
    where: { id: before.id },
    data: {
      status,
      internalNotes,
      actions: toInputJson(actions),
      affectedEntityIds: input.affectedEntityIds === undefined ? undefined : input.affectedEntityIds,
      closedAt: status === 'CLOSED' ? (before.closedAt ?? new Date()) : null,
    },
    select: { id: true, status: true, internalNotes: true, actions: true, affectedEntityIds: true, closedAt: true },
  });

  await prisma.auditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      action: 'TAKEDOWN_CASE_UPDATE',
      entityType: 'TAKEDOWN_CASE',
      entityId: before.id,
      before: toJsonSafe(before),
      after: toJsonSafe(after),
    },
  });
}
