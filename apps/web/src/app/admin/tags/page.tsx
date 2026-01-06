import Link from 'next/link';

import { getPrismaClient } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';
import { ButtonLink } from '@/components/ui/Button';

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

export default async function AdminTagsPage() {
  const prisma = getPrismaClient();
  const tags = await prisma.tag.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      updatedAt: true,
      _count: { select: { entryTags: true } },
    },
    orderBy: [{ name: 'asc' }],
    take: 2000,
  });

  return (
    <>
      <PageHeader badge="Admin" title="Tags" subtitle="Curated tags used for browsing + filtering." />

      <div className={layoutStyles.stack}>
        <div className={layoutStyles.row}>
          <ButtonLink href="/admin/tags/new" size="sm" variant="primary">
            New tag
          </ButtonLink>
          <ButtonLink href="/tags" size="sm">
            Open public tags
          </ButtonLink>
        </div>

        {tags.length === 0 ? (
          <div className={browseStyles.empty}>No tags yet.</div>
        ) : (
          <ol className={browseStyles.list}>
            {tags.map((t) => (
              <li key={t.id} className={browseStyles.item}>
                <div className={browseStyles.itemTitleRow}>
                  <Link className={browseStyles.itemTitle} href={`/admin/tags/${t.id}`}>
                    {t.name}
                  </Link>
                  <span className={browseStyles.itemSlug}>
                    {t.slug} · {t._count.entryTags} entries
                  </span>
                </div>
                <p className={browseStyles.itemSummary}>
                  Updated {formatDate(t.updatedAt)}
                  {t.description ? ` · ${t.description}` : ''}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
