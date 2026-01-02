import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getPrismaClient } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';
import { requireAdminActor } from '@/lib/admin';
import { createIngestRun, createIngestRunsForAllSources } from '@/lib/adminIngest';

export const dynamic = 'force-dynamic';

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

export default async function AdminIngestPage() {
  const prisma = getPrismaClient();
  const sources = await prisma.source.findMany({
    select: { id: true, name: true, enabled: true, lastVerifiedAt: true },
    orderBy: [{ name: 'asc' }],
  });
  const runs = await prisma.ingestRun.findMany({
    select: {
      id: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      source: { select: { name: true } },
      _count: { select: { items: true } },
    },
    orderBy: [{ startedAt: 'desc' }],
    take: 50,
  });

  const enabledSources = sources.filter((s) => s.enabled);

  return (
    <>
      <PageHeader badge="Admin" title="Ingest" subtitle="Runs, items, and review queue." />

      <section style={{ marginTop: 14 }}>
        <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.8 }}>Trigger run</h2>
        {enabledSources.length === 0 ? (
          <div style={{ marginTop: 10, opacity: 0.8 }}>
            No enabled sources. Enable + verify a source in <Link href="/admin/sources">Sources</Link>.
          </div>
        ) : (
          <form action={trigger} style={{ marginTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.75 }}>Source</span>
              <select name="sourceId" required defaultValue={enabledSources[0]?.id}>
                {enabledSources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.75 }}>Max items</span>
              <input name="maxItems" defaultValue="100" inputMode="numeric" />
            </label>

            <label style={{ display: 'flex', gap: 10, alignItems: 'center', alignSelf: 'end' }}>
              <input name="forceReprocess" type="checkbox" />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.75 }}>Force reprocess</span>
            </label>

            <div style={{ alignSelf: 'end' }}>
              <button type="submit">Start ingest</button>
            </div>

            <div style={{ alignSelf: 'end' }}>
              <button formAction={triggerAll} type="submit">
                Start all enabled
              </button>
            </div>
          </form>
        )}
      </section>

      <section style={{ marginTop: 22 }}>
        <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.8 }}>Recent runs</h2>
        {runs.length === 0 ? (
          <div style={{ marginTop: 10, opacity: 0.8 }}>No ingest runs yet.</div>
        ) : (
          <ul style={{ marginTop: 10, paddingLeft: 18, lineHeight: 1.8 }}>
            {runs.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/ingest/runs/${r.id}`}>{r.id}</Link>{' '}
                <span style={{ opacity: 0.8 }}>
                  · {r.source.name} · {r.status} · {r._count.items} items · started {formatDate(r.startedAt)}
                  {r.finishedAt ? ` · finished ${formatDate(r.finishedAt)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

async function trigger(formData: FormData) {
  'use server';

  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN')) {
    throw new Error('Only ADMIN can trigger ingest runs');
  }

  const sourceId = String(formData.get('sourceId') ?? '');
  const maxItems = Number(formData.get('maxItems') ?? 100) || 100;
  const forceReprocess = Boolean(formData.get('forceReprocess'));

  const { ingestRunId } = await createIngestRun({
    actorUserId: actor.dbUserId,
    sourceId,
    maxItems,
    forceReprocess,
  });

  redirect(`/admin/ingest/runs/${ingestRunId}`);
}

async function triggerAll(formData: FormData) {
  'use server';

  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN')) {
    throw new Error('Only ADMIN can trigger ingest runs');
  }

  const maxItems = Number(formData.get('maxItems') ?? 100) || 100;
  const forceReprocess = Boolean(formData.get('forceReprocess'));
  const { ingestRunIds } = await createIngestRunsForAllSources({
    actorUserId: actor.dbUserId,
    maxItems,
    forceReprocess,
  });

  if (ingestRunIds.length === 0) {
    redirect('/admin/ingest');
  }

  redirect(`/admin/ingest/runs/${ingestRunIds[0]}`);
}
