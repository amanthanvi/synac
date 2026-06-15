import Link from 'next/link';

import { getPrismaClient } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';
import { ButtonLink } from '@/components/ui/Button';
import { requireAdminActor } from '@/lib/admin';

import browseStyles from '@/app/_styles/Browse.module.css';
import layoutStyles from '@/app/_styles/Layout.module.css';

export const dynamic = 'force-dynamic';

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(value);
}

export default async function AdminEntriesPage() {
  await requireAdminActor();

  const prisma = getPrismaClient();
  const entries = await prisma.entry.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      entryType: true,
      displayTitle: true,
      primarySlug: true,
      status: true,
      updatedAt: true,
    },
    orderBy: [{ updatedAt: 'desc' }],
    take: 100,
  });

  return (
    <>
      <PageHeader badge="Admin" title="Entries" subtitle="Create, edit, and publish entries." />

      <div className={layoutStyles.stack}>
        <div className={layoutStyles.row}>
          <ButtonLink href="/admin/entries/new" size="sm" variant="primary">
            New entry
          </ButtonLink>
        </div>

        {entries.length === 0 ? (
          <div className={browseStyles.empty}>No entries yet.</div>
        ) : (
          <ol className={browseStyles.list}>
            {entries.map((e) => (
              <li key={e.id} className={browseStyles.item}>
                <div className={browseStyles.itemTitleRow}>
                  <Link className={browseStyles.itemTitle} href={`/admin/entries/${e.id}`}>
                    {e.displayTitle}
                  </Link>
                  <span className={browseStyles.itemSlug}>
                    {e.entryType} · {e.status}
                  </span>
                </div>
                <p className={browseStyles.itemSummary}>
                  /{e.entryType === 'TERM' ? 'term' : 'acronym'}/{e.primarySlug} · updated{' '}
                  {formatDate(e.updatedAt)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
