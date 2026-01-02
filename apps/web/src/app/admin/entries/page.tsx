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

export default async function AdminEntriesPage() {
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

      <div style={{ marginTop: 12 }}>
        <Link href="/admin/entries/new">New entry</Link>
      </div>

      {entries.length === 0 ? (
        <div style={{ marginTop: 14, opacity: 0.8 }}>No entries yet.</div>
      ) : (
        <ul style={{ marginTop: 14, paddingLeft: 18, lineHeight: 1.8 }}>
          {entries.map((e) => (
            <li key={e.id}>
              <Link href={`/admin/entries/${e.id}`}>{e.displayTitle}</Link>{' '}
              <span style={{ opacity: 0.8 }}>
                · {e.entryType} · {e.status} · /{e.entryType === 'TERM' ? 'term' : 'acronym'}/
                {e.primarySlug} · updated {formatDate(e.updatedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
