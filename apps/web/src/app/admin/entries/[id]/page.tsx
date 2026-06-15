import { redirect } from 'next/navigation';

import { getPrismaClient } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';
import { Button, ButtonLink } from '@/components/ui/Button';
import { requireAdminActor } from '@/lib/admin';
import { EntryTagsSection } from './EntryTagsSection';
import {
  createDraftSense,
  moveSense,
  publishEntry,
  updateEntry,
  updateSense,
  archiveEntry,
} from '@/lib/adminEntries';
import { rollbackEntryToAuditEvent } from '@/lib/adminEntryRollback';

import styles from './page.module.css';

export const dynamic = 'force-dynamic';

type AdminEntryPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    published?: string;
    archived?: string;
    saved?: string;
    rolledBack?: string;
  }>;
};

function formatDate(value: Date | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(value);
}

export default async function AdminEntryPage({ params, searchParams }: AdminEntryPageProps) {
  await requireAdminActor();

  const { id } = await params;
  const qp = (await searchParams) ?? {};

  const prisma = getPrismaClient();
  const entry = await prisma.entry.findFirst({
    where: { id, deletedAt: null },
    include: {
      senses: {
        where: { deletedAt: null },
        orderBy: [{ senseOrder: 'asc' }],
      },
      entryTags: {
        where: { tag: { deletedAt: null } },
        include: { tag: true },
        orderBy: [{ tag: { name: 'asc' } }],
      },
    },
  });

  if (!entry) {
    return (
      <>
        <PageHeader badge="Admin" title="Entry not found" subtitle="Unknown entry id." />
        <div className={styles.links}>
          <ButtonLink href="/admin/entries" size="sm">
            Back to entries
          </ButtonLink>
        </div>
      </>
    );
  }

  const provenanceCounts = entry.senses.length
    ? await prisma.fieldProvenance.groupBy({
        by: ['entityId'],
        where: { entityType: 'SENSE', entityId: { in: entry.senses.map((s) => s.id) } },
        _count: { _all: true },
      })
    : [];
  const provenanceBySenseId = new Map(provenanceCounts.map((r) => [r.entityId, r._count._all]));

  const auditEvents = await prisma.auditEvent.findMany({
    where: { entityType: 'ENTRY', entityId: entry.id },
    include: { actorUser: { select: { email: true } } },
    orderBy: [{ createdAt: 'desc' }],
    take: 25,
  });

  const publicUrl =
    entry.status === 'PUBLISHED'
      ? entry.entryType === 'TERM'
        ? `/term/${entry.primarySlug}`
        : `/acronym/${entry.primarySlug}`
      : null;

  return (
    <>
      <PageHeader
        badge="Admin"
        title={entry.displayTitle}
        subtitle={`${entry.entryType} · ${entry.status} · updated ${formatDate(entry.updatedAt)}`}
      />

      <div className={styles.links}>
        <ButtonLink href="/admin/entries" size="sm">
          Back to entries
        </ButtonLink>
        {publicUrl ? (
          <ButtonLink href={publicUrl} size="sm" variant="primary">
            Open public page
          </ButtonLink>
        ) : null}
      </div>

      {qp.saved ? (
        <div className={styles.notice}>Saved.</div>
      ) : qp.published ? (
        <div className={styles.notice}>Published.</div>
      ) : qp.archived ? (
        <div className={styles.notice}>Archived.</div>
      ) : qp.rolledBack ? (
        <div className={styles.notice}>Rolled back.</div>
      ) : null}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Entry fields</h2>
        <form action={saveEntry} className={styles.form}>
          <input type="hidden" name="entryId" value={entry.id} />

          <label className={styles.field}>
            <div className={styles.label}>Display title</div>
            <input
              className={styles.input}
              name="displayTitle"
              defaultValue={entry.displayTitle}
              required
            />
          </label>

          <label className={styles.field}>
            <div className={styles.label}>Slug</div>
            <input
              className={styles.input}
              name="primarySlug"
              defaultValue={entry.primarySlug}
              required
            />
          </label>

          <label className={styles.field}>
            <div className={styles.label}>Summary (Markdown)</div>
            <textarea
              className={styles.textarea}
              name="summaryMd"
              defaultValue={entry.summaryMd ?? ''}
              rows={5}
              placeholder="1–2 sentence short definition."
            />
          </label>

          <label className={styles.field}>
            <div className={styles.label}>Editorial notes (internal)</div>
            <textarea
              className={styles.textarea}
              name="editorialNotes"
              defaultValue={entry.editorialNotes ?? ''}
              rows={3}
              placeholder="Internal notes (not shown publicly)."
            />
          </label>

          <div className={styles.buttonRow}>
            <Button type="submit" variant="primary" size="sm">
              Save
            </Button>
            <Button formAction={publish} type="submit" size="sm">
              Publish
            </Button>
            <Button formAction={archive} type="submit" size="sm">
              Archive
            </Button>
            <div className={styles.muted}>Published at {formatDate(entry.publishedAt)}</div>
          </div>
        </form>
      </section>

      <EntryTagsSection entryId={entry.id} entryTags={entry.entryTags} />

      <section className={styles.section}>
        <div className={styles.sectionTitleRow}>
          <h2 className={styles.sectionTitle}>Senses ({entry.senses.length})</h2>
          <form action={addSense}>
            <input type="hidden" name="entryId" value={entry.id} />
            <Button type="submit" size="sm">
              Add sense
            </Button>
          </form>
        </div>

        {entry.senses.length === 0 ? (
          <div className={styles.notice}>No senses yet.</div>
        ) : (
          <div className={styles.senseList}>
            {entry.senses.map((sense) => {
              const citationCount = provenanceBySenseId.get(sense.id) ?? 0;
              const isPublishableDefinition = Boolean(sense.definitionMd?.trim() || sense.definitionText);
              const hasEditorialRationale = Boolean(sense.isEditorial && sense.editorialRationale?.trim());
              const hasCitations = citationCount > 0;

              return (
                <div key={sense.id} id={`sense-${sense.id}`} className={styles.senseCard}>
                  <div className={styles.senseTop}>
                    <div className={styles.senseMeta}>
                      <div className={styles.senseMetaTitle}>
                        Sense {sense.senseOrder + 1} · {sense.status}
                      </div>
                      <div className={styles.senseMetaSub}>
                        citations: {citationCount} · publishable:{' '}
                        {isPublishableDefinition && (hasCitations || hasEditorialRationale) ? 'yes' : 'no'}
                      </div>
                    </div>

                    <div className={styles.senseMove}>
                      <form action={moveSenseAction}>
                        <input type="hidden" name="senseId" value={sense.id} />
                        <input type="hidden" name="direction" value="UP" />
                        <Button type="submit" size="sm" aria-label="Move sense up">
                          ↑
                        </Button>
                      </form>
                      <form action={moveSenseAction}>
                        <input type="hidden" name="senseId" value={sense.id} />
                        <input type="hidden" name="direction" value="DOWN" />
                        <Button type="submit" size="sm" aria-label="Move sense down">
                          ↓
                        </Button>
                      </form>
                    </div>
                  </div>

                  <form action={saveSense} className={styles.form}>
                    <input type="hidden" name="senseId" value={sense.id} />

                    <label className={styles.field}>
                      <div className={styles.label}>Sense label</div>
                      <input
                        className={styles.input}
                        name="senseLabel"
                        defaultValue={sense.senseLabel ?? ''}
                      />
                    </label>

                    {entry.entryType === 'ACRONYM' ? (
                      <label className={styles.field}>
                        <div className={styles.label}>Expanded form</div>
                        <input
                          className={styles.input}
                          name="expandedForm"
                          defaultValue={sense.expandedForm ?? ''}
                        />
                      </label>
                    ) : (
                      <input type="hidden" name="expandedForm" value="" />
                    )}

                    <label className={styles.field}>
                      <div className={styles.label}>Definition (Markdown)</div>
                      <textarea
                        className={styles.textarea}
                        name="definitionMd"
                        defaultValue={sense.definitionMd ?? ''}
                        rows={6}
                        placeholder="Definition. No raw HTML."
                      />
                    </label>

                    <label className={styles.checkboxRow}>
                      <input
                        type="checkbox"
                        name="isEditorial"
                        defaultChecked={sense.isEditorial}
                      />
                      <div className={styles.label}>
                        Editorial (no citations required if rationale provided)
                      </div>
                    </label>

                    <label className={styles.field}>
                      <div className={styles.label}>Editorial rationale (required if Editorial)</div>
                      <textarea
                        className={styles.textarea}
                        name="editorialRationale"
                        defaultValue={sense.editorialRationale ?? ''}
                        rows={3}
                        placeholder="Why is this uncited editorial content acceptable?"
                      />
                    </label>

                    <div className={styles.buttonRow}>
                      <Button type="submit" size="sm" variant="primary">
                        Save sense
                      </Button>
                      {!hasCitations && !hasEditorialRationale && isPublishableDefinition ? (
                        <div className={styles.muted}>
                          Add citations via ingest, or mark Editorial with rationale.
                        </div>
                      ) : null}
                    </div>
                  </form>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Audit</h2>
        {auditEvents.length === 0 ? (
          <div className={styles.notice}>No audit events yet.</div>
        ) : (
          <ul className={styles.auditList}>
            {auditEvents.map((ev) => {
              const canRollback = Boolean(ev.before) && ev.action !== 'ENTRY_CREATE';
              return (
                <li key={ev.id}>
                  <span className={styles.auditMeta}>
                    {formatDate(ev.createdAt)} · {ev.action} · {ev.actorUser.email}
                  </span>
                  {canRollback ? (
                    <form action={rollbackEntryAction} className={styles.auditRollback}>
                      <input type="hidden" name="entryId" value={entry.id} />
                      <input type="hidden" name="auditEventId" value={ev.id} />
                      <button type="submit" className={styles.inlineButton}>
                        Rollback
                      </button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

async function saveEntry(formData: FormData) {
  'use server';

  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN') && !actor.roleNames.includes('EDITOR')) {
    throw new Error('Not authorized');
  }

  const entryId = String(formData.get('entryId') ?? '');
  const displayTitle = String(formData.get('displayTitle') ?? '');
  const primarySlug = String(formData.get('primarySlug') ?? '');
  const summaryMd = String(formData.get('summaryMd') ?? '');
  const editorialNotes = String(formData.get('editorialNotes') ?? '');

  await updateEntry({
    actorUserId: actor.dbUserId,
    entryId,
    displayTitle,
    primarySlug,
    summaryMd,
    editorialNotes,
  });

  redirect(`/admin/entries/${entryId}?saved=1`);
}

async function addSense(formData: FormData) {
  'use server';

  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN') && !actor.roleNames.includes('EDITOR')) {
    throw new Error('Not authorized');
  }

  const entryId = String(formData.get('entryId') ?? '');
  await createDraftSense({ actorUserId: actor.dbUserId, entryId });

  redirect(`/admin/entries/${entryId}?saved=1`);
}

async function saveSense(formData: FormData) {
  'use server';

  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN') && !actor.roleNames.includes('EDITOR')) {
    throw new Error('Not authorized');
  }

  const senseId = String(formData.get('senseId') ?? '');
  const senseLabel = String(formData.get('senseLabel') ?? '');
  const expandedForm = String(formData.get('expandedForm') ?? '');
  const definitionMd = String(formData.get('definitionMd') ?? '');
  const isEditorial = formData.get('isEditorial') === 'on';
  const editorialRationale = String(formData.get('editorialRationale') ?? '');

  await updateSense({
    actorUserId: actor.dbUserId,
    senseId,
    senseLabel,
    expandedForm,
    definitionMd,
    isEditorial,
    editorialRationale,
  });

  redirect(`/admin/entries/${await getEntryIdForSense(senseId)}?saved=1#sense-${senseId}`);
}

async function moveSenseAction(formData: FormData) {
  'use server';

  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN') && !actor.roleNames.includes('EDITOR')) {
    throw new Error('Not authorized');
  }

  const senseId = String(formData.get('senseId') ?? '');
  const directionRaw = String(formData.get('direction') ?? '').toUpperCase();
  const direction = directionRaw === 'UP' ? 'UP' : 'DOWN';

  await moveSense({ actorUserId: actor.dbUserId, senseId, direction });

  redirect(`/admin/entries/${await getEntryIdForSense(senseId)}?saved=1#sense-${senseId}`);
}

async function publish(formData: FormData) {
  'use server';

  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN') && !actor.roleNames.includes('EDITOR')) {
    throw new Error('Not authorized');
  }

  const entryId = String(formData.get('entryId') ?? '');
  await publishEntry({ actorUserId: actor.dbUserId, entryId });
  redirect(`/admin/entries/${entryId}?published=1`);
}

async function archive(formData: FormData) {
  'use server';

  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN')) {
    throw new Error('Only ADMIN can archive entries');
  }

  const entryId = String(formData.get('entryId') ?? '');
  await archiveEntry({ actorUserId: actor.dbUserId, entryId });
  redirect(`/admin/entries/${entryId}?archived=1`);
}

async function rollbackEntryAction(formData: FormData) {
  'use server';

  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN')) {
    throw new Error('Only ADMIN can roll back entries');
  }

  const entryId = String(formData.get('entryId') ?? '');
  const auditEventId = String(formData.get('auditEventId') ?? '');

  await rollbackEntryToAuditEvent({
    actorUserId: actor.dbUserId,
    entryId,
    auditEventId,
  });

  redirect(`/admin/entries/${entryId}?rolledBack=1`);
}

async function getEntryIdForSense(senseId: string): Promise<string> {
  const prisma = getPrismaClient();
  const sense = await prisma.sense.findFirst({
    where: { id: senseId, deletedAt: null },
    select: { entryId: true },
  });
  if (!sense) throw new Error('Sense not found');
  return sense.entryId;
}
