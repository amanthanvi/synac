import Link from 'next/link';

import { getPrismaClient } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';
import { ButtonLink } from '@/components/ui/Button';

import browseStyles from '@/app/_styles/Browse.module.css';
import layoutStyles from '@/app/_styles/Layout.module.css';

export const dynamic = 'force-dynamic';

function formatDate(value: Date | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(value);
}

export default async function AdminSourcesPage() {
  const prisma = getPrismaClient();
  const sources = await prisma.source.findMany({
    select: {
      id: true,
      name: true,
      sourceSlug: true,
      enabled: true,
      trustTier: true,
      licenseType: true,
      lastVerifiedAt: true,
      updatedAt: true,
    },
    orderBy: [{ updatedAt: 'desc' }],
    take: 200,
  });

  return (
    <>
      <PageHeader badge="Admin" title="Sources" subtitle="Manage source registry and policies." />

      <div className={layoutStyles.stack}>
        <div className={layoutStyles.row}>
          <ButtonLink href="/admin/sources/new" size="sm" variant="primary">
            New source
          </ButtonLink>
        </div>

        {sources.length === 0 ? (
          <div className={browseStyles.empty}>No sources yet.</div>
        ) : (
          <ol className={browseStyles.list}>
            {sources.map((s) => (
              <li key={s.id} className={browseStyles.item}>
                <div className={browseStyles.itemTitleRow}>
                  <Link className={browseStyles.itemTitle} href={`/admin/sources/${s.id}`}>
                    {s.name}
                  </Link>
                  <span className={browseStyles.itemSlug}>
                    {s.enabled ? 'ENABLED' : 'DISABLED'} · {s.trustTier}
                  </span>
                </div>
                <p className={browseStyles.itemSummary}>
                  {s.licenseType} · slug <code>{s.sourceSlug}</code> · verified{' '}
                  {formatDate(s.lastVerifiedAt)} · updated {formatDate(s.updatedAt)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
