import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { getPrismaClient, type Prisma } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';
import { requireAdminActor } from '@/lib/admin';
import { markSourceDocumentDoNotUse, purgeDerivedContentForSourceDocument, updateTakedownCase } from '@/lib/adminTakedown';

export const dynamic = 'force-dynamic';

type AdminTakedownCasePageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ saved?: string; dnu?: string; purged?: string }>;
};

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

function parseJsonInput(value: string): Prisma.InputJsonValue | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return JSON.parse(trimmed) as Prisma.InputJsonValue;
}

function parseAffectedEntityIds(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  if (Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

function mergeAffectedEntityIds(
  before: Record<string, unknown>,
  delta: {
    sourceDocumentId?: string;
    senseIds?: string[];
    entriesSummaryCleared?: string[];
    entriesArchived?: string[];
  },
): Prisma.InputJsonValue {
  const sourceDocuments = new Set(normalizeStringArray(before.sourceDocuments));
  const senses = new Set(normalizeStringArray(before.senses));
  const entriesSummaryCleared = new Set(normalizeStringArray(before.entriesSummaryCleared));
  const entriesArchived = new Set(normalizeStringArray(before.entriesArchived));

  if (delta.sourceDocumentId?.trim()) sourceDocuments.add(delta.sourceDocumentId.trim());
  for (const id of delta.senseIds ?? []) senses.add(id);
  for (const id of delta.entriesSummaryCleared ?? []) entriesSummaryCleared.add(id);
  for (const id of delta.entriesArchived ?? []) entriesArchived.add(id);

  return {
    sourceDocuments: Array.from(sourceDocuments),
    senses: Array.from(senses),
    entriesSummaryCleared: Array.from(entriesSummaryCleared),
    entriesArchived: Array.from(entriesArchived),
  };
}

export default async function AdminTakedownCasePage({ params, searchParams }: AdminTakedownCasePageProps) {
  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN')) {
    throw new Error('Only ADMIN can manage takedown');
  }

  const { id } = await params;
  const qp = searchParams ? await searchParams : {};

  const prisma = getPrismaClient();
  const c = await prisma.takedownCase.findFirst({
    where: { id },
    select: {
      id: true,
      status: true,
      requesterContact: true,
      requestText: true,
      internalNotes: true,
      actions: true,
      affectedEntityIds: true,
      createdAt: true,
      updatedAt: true,
      closedAt: true,
      sourceId: true,
      sourceDocumentId: true,
      entryId: true,
      createdByUser: { select: { email: true } },
      source: { select: { id: true, name: true } },
      entry: { select: { id: true, entryType: true, displayTitle: true, primarySlug: true } },
      sourceDocument: {
        select: {
          id: true,
          url: true,
          canonicalUrl: true,
          doNotUse: true,
          doNotUseReason: true,
          doNotUseAt: true,
          doNotUseByUserId: true,
        },
      },
    },
  });

  if (!c) notFound();

  const entryUrl =
    c.entry?.primarySlug && c.entry.entryType === 'TERM'
      ? `/term/${c.entry.primarySlug}`
      : c.entry?.primarySlug
        ? `/acronym/${c.entry.primarySlug}`
        : null;

  return (
    <>
      <PageHeader badge="Admin" title={`Takedown case ${c.id}`} subtitle={`${c.status} · created by ${c.createdByUser.email}`} />

      <div style={{ marginTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/admin/takedown">All cases</Link>
        {c.sourceId ? <Link href={`/admin/sources/${c.sourceId}`}>Source</Link> : null}
        {c.entryId ? <Link href={`/admin/entries/${c.entryId}`}>Entry</Link> : null}
        {entryUrl ? (
          <a href={entryUrl} target="_blank" rel="noopener noreferrer">
            Public
          </a>
        ) : null}
      </div>

      {qp.saved ? (
        <div style={{ marginTop: 12, opacity: 0.9 }}>Saved.</div>
      ) : qp.dnu ? (
        <div style={{ marginTop: 12, opacity: 0.9 }}>Marked do-not-use.</div>
      ) : qp.purged ? (
        <div style={{ marginTop: 12, opacity: 0.9 }}>Purged derived content.</div>
      ) : null}

      <div style={{ marginTop: 12, fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.8 }}>
        Created {formatDate(c.createdAt)} · Updated {formatDate(c.updatedAt)}
        {c.closedAt ? ` · Closed ${formatDate(c.closedAt)}` : ''}
      </div>

      <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.8 }}>Requester contact</div>
        <div style={{ opacity: 0.9 }}>{c.requesterContact?.trim() ? c.requesterContact : '—'}</div>
      </div>

      <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.8 }}>Request</div>
        <pre style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5, margin: 0, opacity: 0.95 }}>{c.requestText}</pre>
      </div>

      <form action={saveCase} style={{ maxWidth: 920, marginTop: 18, display: 'grid', gap: 12 }}>
        <input type="hidden" name="takedownCaseId" value={c.id} />

        <label style={{ display: 'grid', gap: 6 }}>
          <div style={{ opacity: 0.85 }}>Status</div>
          <select name="status" defaultValue={c.status} required>
            <option value="OPEN">OPEN</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="CLOSED">CLOSED</option>
          </select>
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <div style={{ opacity: 0.85 }}>Internal notes</div>
          <textarea name="internalNotes" rows={6} defaultValue={c.internalNotes ?? ''} />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <div style={{ opacity: 0.85 }}>Append action note (optional)</div>
          <input name="appendAction" placeholder="e.g., Emailed requester; disabled source; purged item(s)." />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <div style={{ opacity: 0.85 }}>Affected entity IDs JSON (optional)</div>
          <textarea
            name="affectedEntityIds"
            rows={5}
            defaultValue={c.affectedEntityIds ? JSON.stringify(c.affectedEntityIds, null, 2) : ''}
            placeholder='e.g. {"sourceDocuments":["..."],"senses":["..."],"entriesArchived":["..."]}'
          />
        </label>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button type="submit">Save</button>
          <div style={{ opacity: 0.7, fontSize: 12 }}>
            Writes audit event <code>TAKEDOWN_CASE_UPDATE</code>.
          </div>
        </div>
      </form>

      <details style={{ marginTop: 16 }}>
        <summary style={{ cursor: 'pointer', opacity: 0.85 }}>Actions log JSON</summary>
        <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{JSON.stringify(c.actions, null, 2)}</pre>
      </details>

      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: 'pointer', opacity: 0.85 }}>Affected entity IDs JSON</summary>
        <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
          {JSON.stringify(c.affectedEntityIds, null, 2)}
        </pre>
      </details>

      {c.sourceDocument ? (
        <>
          <div style={{ marginTop: 22, fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.8 }}>
            SourceDocument actions
          </div>

          <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <a href={c.sourceDocument.canonicalUrl ?? c.sourceDocument.url} target="_blank" rel="noopener noreferrer">
              Open source doc
            </a>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.8 }}>
              {c.sourceDocument.doNotUse ? 'DO_NOT_USE' : 'ALLOW_USE'}
              {c.sourceDocument.doNotUseAt ? ` · set ${formatDate(c.sourceDocument.doNotUseAt)}` : ''}
            </span>
            {c.sourceDocument.doNotUseReason?.trim() ? (
              <span style={{ opacity: 0.85 }}>· {c.sourceDocument.doNotUseReason}</span>
            ) : null}
          </div>

          <form action={markDnu} style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="hidden" name="takedownCaseId" value={c.id} />
            <input type="hidden" name="sourceDocumentId" value={c.sourceDocument.id} />
            <input name="reason" placeholder="Do-not-use reason" style={{ minWidth: 320 }} />
            <button type="submit">Mark do-not-use</button>
          </form>

          <form action={purge} style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="hidden" name="takedownCaseId" value={c.id} />
            <input type="hidden" name="sourceDocumentId" value={c.sourceDocument.id} />
            <button type="submit">Purge derived content</button>
            <span style={{ opacity: 0.7, fontSize: 12 }}>
              Archives senses + clears derived summaries + archives empty published entries.
            </span>
          </form>
        </>
      ) : null}
    </>
  );
}

async function saveCase(formData: FormData) {
  'use server';

  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN')) {
    throw new Error('Only ADMIN can manage takedown');
  }

  const takedownCaseId = String(formData.get('takedownCaseId') ?? '');
  const status = String(formData.get('status') ?? 'OPEN') as 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
  const internalNotes = String(formData.get('internalNotes') ?? '');
  const appendAction = String(formData.get('appendAction') ?? '');
  const affectedEntityIdsRaw = String(formData.get('affectedEntityIds') ?? '');

  await updateTakedownCase({
    actorUserId: actor.dbUserId,
    takedownCaseId,
    status,
    internalNotes,
    appendAction,
    affectedEntityIds: parseJsonInput(affectedEntityIdsRaw),
  });

  redirect(`/admin/takedown/${takedownCaseId}?saved=1`);
}

async function markDnu(formData: FormData) {
  'use server';

  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN')) {
    throw new Error('Only ADMIN can manage takedown');
  }

  const takedownCaseId = String(formData.get('takedownCaseId') ?? '');
  const sourceDocumentId = String(formData.get('sourceDocumentId') ?? '');
  const reason = String(formData.get('reason') ?? '');

  await markSourceDocumentDoNotUse({ actorUserId: actor.dbUserId, sourceDocumentId, reason });

  const prisma = getPrismaClient();
  const existing = await prisma.takedownCase.findFirst({
    where: { id: takedownCaseId },
    select: { affectedEntityIds: true },
  });

  await updateTakedownCase({
    actorUserId: actor.dbUserId,
    takedownCaseId,
    appendAction: `Marked SourceDocument ${sourceDocumentId} do-not-use: ${reason.trim()}`,
    affectedEntityIds: mergeAffectedEntityIds(parseAffectedEntityIds(existing?.affectedEntityIds), { sourceDocumentId }),
  });

  redirect(`/admin/takedown/${takedownCaseId}?dnu=1`);
}

async function purge(formData: FormData) {
  'use server';

  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN')) {
    throw new Error('Only ADMIN can manage takedown');
  }

  const takedownCaseId = String(formData.get('takedownCaseId') ?? '');
  const sourceDocumentId = String(formData.get('sourceDocumentId') ?? '');

  const result = await purgeDerivedContentForSourceDocument({
    actorUserId: actor.dbUserId,
    sourceDocumentId,
  });

  const prisma = getPrismaClient();
  const existing = await prisma.takedownCase.findFirst({
    where: { id: takedownCaseId },
    select: { affectedEntityIds: true },
  });

  const merged = mergeAffectedEntityIds(parseAffectedEntityIds(existing?.affectedEntityIds), {
    sourceDocumentId,
    senseIds: result.senseIdsArchived,
    entriesSummaryCleared: result.entryIdsSummaryCleared,
    entriesArchived: result.entryIdsArchived,
  });

  await updateTakedownCase({
    actorUserId: actor.dbUserId,
    takedownCaseId,
    appendAction: `Purged derived content for SourceDocument ${sourceDocumentId} (archived ${result.sensesArchived} senses; cleared ${result.entriesUpdated} summaries; archived ${result.entriesArchived} entries).`,
    affectedEntityIds: merged,
  });

  redirect(`/admin/takedown/${takedownCaseId}?purged=1`);
}
