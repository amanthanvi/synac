import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { getPrismaClient } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';
import { requireAdminActor } from '@/lib/admin';
import { approveIngestItem, rejectIngestItem } from '@/lib/adminIngest';

export const dynamic = 'force-dynamic';

type AdminIngestRunPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ approved?: string; rejected?: string }>;
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

function getProposedTitle(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  return typeof v.displayTitle === 'string' ? v.displayTitle : null;
}

function getAppliedEntryId(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  return typeof v.appliedEntryId === 'string' ? v.appliedEntryId : null;
}

export default async function AdminIngestRunPage({ params, searchParams }: AdminIngestRunPageProps) {
  const { id } = await params;
  const qp = searchParams ? await searchParams : {};

  const prisma = getPrismaClient();
  const run = await prisma.ingestRun.findFirst({
    where: { id },
    select: {
      id: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      source: { select: { id: true, name: true } },
      items: {
        select: {
          id: true,
          stage: true,
          licenseGate: true,
          licenseGateReason: true,
          confidenceScore: true,
          error: true,
          proposedChange: true,
          diff: true,
          sourceDocument: { select: { url: true, canonicalUrl: true } },
        },
        orderBy: [{ stage: 'asc' }, { id: 'asc' }],
        take: 200,
      },
    },
  });

  if (!run) notFound();

  return (
    <>
      <PageHeader
        badge="Admin"
        title={`Ingest run ${run.id}`}
        subtitle={`${run.source.name} · ${run.status}`}
      />

      <div style={{ marginTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/admin/ingest">All runs</Link>
        <Link href={`/admin/sources/${run.source.id}`}>Source</Link>
      </div>

      {qp.approved ? (
        <div style={{ marginTop: 12, opacity: 0.9 }}>Approved.</div>
      ) : qp.rejected ? (
        <div style={{ marginTop: 12, opacity: 0.9 }}>Rejected.</div>
      ) : null}

      <div style={{ marginTop: 12, fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.8 }}>
        Started {formatDate(run.startedAt)}
        {run.finishedAt ? ` · Finished ${formatDate(run.finishedAt)}` : ''}
        · {run.items.length} items (showing up to 200)
      </div>

      {run.items.length === 0 ? (
        <div style={{ marginTop: 14, opacity: 0.8 }}>No items yet.</div>
      ) : (
        <ul style={{ marginTop: 14, paddingLeft: 18, lineHeight: 1.8 }}>
          {run.items.map((item) => {
            const title = getProposedTitle(item.proposedChange) ?? 'Untitled';
            const docUrl = item.sourceDocument.canonicalUrl ?? item.sourceDocument.url;
            const appliedEntryId = getAppliedEntryId(item.diff);

            return (
              <li key={item.id} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    {item.stage} · {item.licenseGate}
                    {item.confidenceScore != null ? ` · score ${item.confidenceScore}` : ''}
                  </span>
                  <span style={{ opacity: 0.9 }}>{title}</span>
                  <a href={docUrl} target="_blank" rel="noopener noreferrer">
                    Source doc
                  </a>
                  {appliedEntryId ? <Link href={`/admin/entries/${appliedEntryId}`}>Entry</Link> : null}
                </div>

                {item.error ? (
                  <div style={{ marginTop: 6, opacity: 0.85 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>Error:</span> {item.error}
                  </div>
                ) : null}

                {item.licenseGateReason ? (
                  <div style={{ marginTop: 6, opacity: 0.85 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>License:</span> {item.licenseGateReason}
                  </div>
                ) : null}

                <div style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <form action={approve} style={{ display: 'inline' }}>
                    <input type="hidden" name="ingestItemId" value={item.id} />
                    <button type="submit" disabled={item.stage === 'APPLIED' || item.stage === 'REJECTED'}>
                      Approve
                    </button>
                  </form>

                  <form action={reject} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="hidden" name="runId" value={run.id} />
                    <input type="hidden" name="ingestItemId" value={item.id} />
                    <input name="reason" placeholder="Reject reason" style={{ minWidth: 260 }} />
                    <button type="submit" disabled={item.stage === 'APPLIED' || item.stage === 'REJECTED'}>
                      Reject
                    </button>
                  </form>
                </div>

                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: 'pointer', opacity: 0.85 }}>Proposed change JSON</summary>
                  <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                    {JSON.stringify(item.proposedChange, null, 2)}
                  </pre>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

async function approve(formData: FormData) {
  'use server';

  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN') && !actor.roleNames.includes('EDITOR')) {
    throw new Error('Not authorized');
  }

  const ingestItemId = String(formData.get('ingestItemId') ?? '');
  const { entryId } = await approveIngestItem({ actorUserId: actor.dbUserId, ingestItemId });

  redirect(`/admin/entries/${entryId}`);
}

async function reject(formData: FormData) {
  'use server';

  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN') && !actor.roleNames.includes('EDITOR')) {
    throw new Error('Not authorized');
  }

  const runId = String(formData.get('runId') ?? '');
  const ingestItemId = String(formData.get('ingestItemId') ?? '');
  const reason = String(formData.get('reason') ?? '');

  await rejectIngestItem({ actorUserId: actor.dbUserId, ingestItemId, reason });
  redirect(`/admin/ingest/runs/${runId}?rejected=1`);
}
