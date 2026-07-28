import { notFound, redirect } from 'next/navigation';

import { getPrismaClient, type InputJsonValue } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';
import { Button, ButtonLink } from '@/components/ui/Button';
import { requireAdminActor } from '@/lib/admin';
import { markSourceDocumentDoNotUse, purgeDerivedContentForSourceDocument, updateTakedownCase } from '@/lib/adminTakedown';

import styles from './page.module.css';

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

function parseJsonInput(value: string): InputJsonValue | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return JSON.parse(trimmed) as InputJsonValue;
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
): InputJsonValue {
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
  if (!actor.roleNames.includes('ADMIN')) notFound();

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
      <PageHeader
        badge="Admin"
        title={`Takedown case ${c.id}`}
        subtitle={`${c.status} · created by ${c.createdByUser.email}`}
      />

      <div className={styles.links}>
        <ButtonLink href="/admin/takedown" size="sm">
          All cases
        </ButtonLink>
        {c.sourceId ? (
          <ButtonLink href={`/admin/sources/${c.sourceId}`} size="sm">
            Source
          </ButtonLink>
        ) : null}
        {c.entryId ? (
          <ButtonLink href={`/admin/entries/${c.entryId}`} size="sm">
            Entry
          </ButtonLink>
        ) : null}
        {entryUrl ? (
          <a className={styles.inlineLink} href={entryUrl} target="_blank" rel="noopener noreferrer">
            Public
          </a>
        ) : null}
      </div>

      {qp.saved ? (
        <div className={styles.notice}>Saved.</div>
      ) : qp.dnu ? (
        <div className={styles.notice}>Marked do-not-use.</div>
      ) : qp.purged ? (
        <div className={styles.notice}>Purged derived content.</div>
      ) : null}

      <div className={styles.meta}>
        Created {formatDate(c.createdAt)} · Updated {formatDate(c.updatedAt)}
        {c.closedAt ? ` · Closed ${formatDate(c.closedAt)}` : ''}
      </div>

      <div className={styles.infoBlock}>
        <div className={styles.infoLabel}>Requester contact</div>
        <div className={styles.infoValue}>{c.requesterContact?.trim() ? c.requesterContact : '—'}</div>
      </div>

      <div className={styles.infoBlock}>
        <div className={styles.infoLabel}>Request</div>
        <pre className={styles.pre}>{c.requestText}</pre>
      </div>

      <form action={saveCase} className={styles.form}>
        <input type="hidden" name="takedownCaseId" value={c.id} />

        <label className={styles.field}>
          <div className={styles.label}>Status</div>
          <select className={styles.select} name="status" defaultValue={c.status} required>
            <option value="OPEN">OPEN</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="CLOSED">CLOSED</option>
          </select>
        </label>

        <label className={styles.field}>
          <div className={styles.label}>Internal notes</div>
          <textarea
            className={styles.textarea}
            name="internalNotes"
            rows={6}
            defaultValue={c.internalNotes ?? ''}
          />
        </label>

        <label className={styles.field}>
          <div className={styles.label}>Append action note (optional)</div>
          <input
            className={styles.input}
            name="appendAction"
            placeholder="e.g., Emailed requester; disabled source; purged item(s)."
          />
        </label>

        <label className={styles.field}>
          <div className={styles.label}>Affected entity IDs JSON (optional)</div>
          <textarea
            className={styles.textarea}
            name="affectedEntityIds"
            rows={5}
            defaultValue={c.affectedEntityIds ? JSON.stringify(c.affectedEntityIds, null, 2) : ''}
            placeholder='e.g. {"sourceDocuments":["..."],"senses":["..."],"entriesArchived":["..."]}'
          />
        </label>

        <div className={styles.buttonRow}>
          <Button type="submit" variant="primary" size="sm">
            Save
          </Button>
          <div className={styles.note}>
            Writes audit event <code>TAKEDOWN_CASE_UPDATE</code>.
          </div>
        </div>
      </form>

      <details className={styles.details}>
        <summary className={styles.summary}>Actions log JSON</summary>
        <div className={styles.detailsBody}>
          <pre className={styles.pre}>{JSON.stringify(c.actions, null, 2)}</pre>
        </div>
      </details>

      <details className={styles.details}>
        <summary className={styles.summary}>Affected entity IDs JSON</summary>
        <div className={styles.detailsBody}>
          <pre className={styles.pre}>{JSON.stringify(c.affectedEntityIds, null, 2)}</pre>
        </div>
      </details>

      {c.sourceDocument ? (
        <>
          <div className={styles.sectionTitle}>SourceDocument actions</div>

          <div className={styles.actionRow}>
            <a
              className={styles.inlineLink}
              href={c.sourceDocument.canonicalUrl ?? c.sourceDocument.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open source doc
            </a>
            <span className={styles.meta}>
              {c.sourceDocument.doNotUse ? 'DO_NOT_USE' : 'ALLOW_USE'}
              {c.sourceDocument.doNotUseAt ? ` · set ${formatDate(c.sourceDocument.doNotUseAt)}` : ''}
            </span>
            {c.sourceDocument.doNotUseReason?.trim() ? (
              <span className={styles.note}>· {c.sourceDocument.doNotUseReason}</span>
            ) : null}
          </div>

          <form action={markDnu} className={styles.actionForm}>
            <input type="hidden" name="takedownCaseId" value={c.id} />
            <input type="hidden" name="sourceDocumentId" value={c.sourceDocument.id} />
            <input
              className={`${styles.input} ${styles.reasonInput}`}
              name="reason"
              placeholder="Do-not-use reason"
            />
            <Button type="submit" size="sm">
              Mark do-not-use
            </Button>
          </form>

          <form action={purge} className={styles.actionForm}>
            <input type="hidden" name="takedownCaseId" value={c.id} />
            <input type="hidden" name="sourceDocumentId" value={c.sourceDocument.id} />
            <Button type="submit" size="sm">
              Purge derived content
            </Button>
            <span className={styles.note}>
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
