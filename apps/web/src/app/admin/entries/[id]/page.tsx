import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getPrismaClient } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';
import { requireAdminActor } from '@/lib/admin';
import {
  createDraftSense,
  moveSense,
  publishEntry,
  updateEntry,
  updateSense,
  archiveEntry,
} from '@/lib/adminEntries';

export const dynamic = 'force-dynamic';

type AdminEntryPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ published?: string; archived?: string; saved?: string }>;
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
    },
  });

  if (!entry) {
    return (
      <>
        <PageHeader badge="Admin" title="Entry not found" subtitle="Unknown entry id." />
        <div style={{ marginTop: 12 }}>
          <Link href="/admin/entries">Back to entries</Link>
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

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 10 }}>
        <Link href="/admin/entries">Back to entries</Link>
        {publicUrl ? <Link href={publicUrl}>Open public page</Link> : null}
      </div>

      {qp.saved ? (
        <div style={{ marginTop: 12, opacity: 0.9 }}>Saved.</div>
      ) : qp.published ? (
        <div style={{ marginTop: 12, opacity: 0.9 }}>Published.</div>
      ) : qp.archived ? (
        <div style={{ marginTop: 12, opacity: 0.9 }}>Archived.</div>
      ) : null}

      <section style={{ marginTop: 18 }}>
        <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.8 }}>
          Entry fields
        </h2>
        <form action={saveEntry} style={{ marginTop: 12, display: 'grid', gap: 12 }}>
          <input type="hidden" name="entryId" value={entry.id} />

          <label style={{ display: 'grid', gap: 6 }}>
            <div style={{ opacity: 0.85 }}>Display title</div>
            <input name="displayTitle" defaultValue={entry.displayTitle} required />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <div style={{ opacity: 0.85 }}>Slug</div>
            <input name="primarySlug" defaultValue={entry.primarySlug} required />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <div style={{ opacity: 0.85 }}>Summary (Markdown)</div>
            <textarea
              name="summaryMd"
              defaultValue={entry.summaryMd ?? ''}
              rows={5}
              placeholder="1–2 sentence short definition."
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <div style={{ opacity: 0.85 }}>Editorial notes (internal)</div>
            <textarea
              name="editorialNotes"
              defaultValue={entry.editorialNotes ?? ''}
              rows={3}
              placeholder="Internal notes (not shown publicly)."
            />
          </label>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <button type="submit">Save</button>
            <button
              formAction={publish}
              type="submit"
              style={{ border: '1px solid var(--border)', padding: '6px 10px' }}
            >
              Publish
            </button>
            <button
              formAction={archive}
              type="submit"
              style={{ border: '1px solid var(--border)', padding: '6px 10px' }}
            >
              Archive
            </button>
            <div style={{ opacity: 0.7, fontSize: 12 }}>
              Published at {formatDate(entry.publishedAt)}
            </div>
          </div>
        </form>
      </section>

      <section style={{ marginTop: 22 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.8 }}>
            Senses ({entry.senses.length})
          </h2>
          <form action={addSense}>
            <input type="hidden" name="entryId" value={entry.id} />
            <button type="submit">Add sense</button>
          </form>
        </div>

        {entry.senses.length === 0 ? (
          <div style={{ marginTop: 12, opacity: 0.8 }}>No senses yet.</div>
        ) : (
          <div style={{ marginTop: 12, display: 'grid', gap: 14 }}>
            {entry.senses.map((sense) => {
              const citationCount = provenanceBySenseId.get(sense.id) ?? 0;
              const isPublishableDefinition = Boolean(sense.definitionMd?.trim() || sense.definitionText);
              const hasEditorialRationale = Boolean(sense.isEditorial && sense.editorialRationale?.trim());
              const hasCitations = citationCount > 0;

              return (
                <div
                  key={sense.id}
                  id={`sense-${sense.id}`}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 16,
                    padding: 14,
                    background: 'color-mix(in srgb, var(--bg1) 78%, transparent)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'grid', gap: 4 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.8 }}>
                        Sense {sense.senseOrder + 1} · {sense.status}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>
                        citations: {citationCount} · publishable:{' '}
                        {isPublishableDefinition && (hasCitations || hasEditorialRationale) ? 'yes' : 'no'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <form action={moveSenseAction}>
                        <input type="hidden" name="senseId" value={sense.id} />
                        <input type="hidden" name="direction" value="UP" />
                        <button type="submit" aria-label="Move sense up">
                          ↑
                        </button>
                      </form>
                      <form action={moveSenseAction}>
                        <input type="hidden" name="senseId" value={sense.id} />
                        <input type="hidden" name="direction" value="DOWN" />
                        <button type="submit" aria-label="Move sense down">
                          ↓
                        </button>
                      </form>
                    </div>
                  </div>

                  <form action={saveSense} style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                    <input type="hidden" name="senseId" value={sense.id} />

                    <label style={{ display: 'grid', gap: 6 }}>
                      <div style={{ opacity: 0.85 }}>Sense label</div>
                      <input name="senseLabel" defaultValue={sense.senseLabel ?? ''} />
                    </label>

                    {entry.entryType === 'ACRONYM' ? (
                      <label style={{ display: 'grid', gap: 6 }}>
                        <div style={{ opacity: 0.85 }}>Expanded form</div>
                        <input name="expandedForm" defaultValue={sense.expandedForm ?? ''} />
                      </label>
                    ) : (
                      <input type="hidden" name="expandedForm" value="" />
                    )}

                    <label style={{ display: 'grid', gap: 6 }}>
                      <div style={{ opacity: 0.85 }}>Definition (Markdown)</div>
                      <textarea
                        name="definitionMd"
                        defaultValue={sense.definitionMd ?? ''}
                        rows={6}
                        placeholder="Definition. No raw HTML."
                      />
                    </label>

                    <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        name="isEditorial"
                        defaultChecked={sense.isEditorial}
                      />
                      <div style={{ opacity: 0.85 }}>
                        Editorial (no citations required if rationale provided)
                      </div>
                    </label>

                    <label style={{ display: 'grid', gap: 6 }}>
                      <div style={{ opacity: 0.85 }}>Editorial rationale (required if Editorial)</div>
                      <textarea
                        name="editorialRationale"
                        defaultValue={sense.editorialRationale ?? ''}
                        rows={3}
                        placeholder="Why is this uncited editorial content acceptable?"
                      />
                    </label>

                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button type="submit">Save sense</button>
                      {!hasCitations && !hasEditorialRationale && isPublishableDefinition ? (
                        <div style={{ fontSize: 12, opacity: 0.75 }}>
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

async function getEntryIdForSense(senseId: string): Promise<string> {
  const prisma = getPrismaClient();
  const sense = await prisma.sense.findFirst({
    where: { id: senseId, deletedAt: null },
    select: { entryId: true },
  });
  if (!sense) throw new Error('Sense not found');
  return sense.entryId;
}

