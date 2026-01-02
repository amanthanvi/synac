import Link from 'next/link';

import { getPrismaClient } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';

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

      <div style={{ marginTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/admin/tags/new">New tag</Link>
        <Link href="/tags">Open public tags</Link>
      </div>

      {tags.length === 0 ? (
        <div style={{ marginTop: 14, opacity: 0.8 }}>No tags yet.</div>
      ) : (
        <ul style={{ marginTop: 14, paddingLeft: 18, lineHeight: 1.8 }}>
          {tags.map((t) => (
            <li key={t.id}>
              <Link href={`/admin/tags/${t.id}`}>{t.name}</Link>{' '}
              <span style={{ opacity: 0.8 }}>
                · {t.slug} · {t._count.entryTags} entries · updated {formatDate(t.updatedAt)}
              </span>
              {t.description ? <div style={{ opacity: 0.75 }}>{t.description}</div> : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

