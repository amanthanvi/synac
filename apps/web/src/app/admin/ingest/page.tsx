import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getPrismaClient } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { requireAdminActor } from '@/lib/admin';
import { createIngestRun, createIngestRunsForAllSources } from '@/lib/adminIngest';

import browseStyles from '@/app/_styles/Browse.module.css';
import layoutStyles from '@/app/_styles/Layout.module.css';
import styles from './page.module.css';

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

      <div className={layoutStyles.stack}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Trigger run</h2>
        {enabledSources.length === 0 ? (
          <div className={styles.notice}>
            No enabled sources. Enable + verify a source in <Link href="/admin/sources">Sources</Link>.
          </div>
        ) : (
          <form action={trigger} className={styles.form}>
            <label className={styles.field}>
              <span className={styles.label}>Source</span>
              <select className={styles.select} name="sourceId" required defaultValue={enabledSources[0]?.id}>
                {enabledSources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Max items</span>
              <input className={styles.input} name="maxItems" defaultValue="100" inputMode="numeric" />
            </label>

            <label className={styles.checkboxRow}>
              <input name="forceReprocess" type="checkbox" />
              <span className={styles.label}>Force reprocess</span>
            </label>

            <Button type="submit" variant="primary" size="sm">
              Start ingest
            </Button>

            <Button formAction={triggerAll} type="submit" size="sm">
              Start all enabled
            </Button>
          </form>
        )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Recent runs</h2>
        {runs.length === 0 ? (
          <div className={browseStyles.empty}>No ingest runs yet.</div>
        ) : (
          <ol className={browseStyles.list}>
            {runs.map((r) => (
              <li key={r.id} className={browseStyles.item}>
                <div className={browseStyles.itemTitleRow}>
                  <Link className={browseStyles.itemTitle} href={`/admin/ingest/runs/${r.id}`}>
                    {r.id}
                  </Link>
                  <span className={browseStyles.itemSlug}>
                    {r.status} · {r._count.items} items
                  </span>
                </div>
                <p className={browseStyles.itemSummary}>
                  {r.source.name} · started {formatDate(r.startedAt)}
                  {r.finishedAt ? ` · finished ${formatDate(r.finishedAt)}` : ''}
                </p>
              </li>
            ))}
          </ol>
        )}
        </section>
      </div>
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
