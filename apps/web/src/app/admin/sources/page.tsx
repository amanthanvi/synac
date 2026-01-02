import Link from 'next/link';

import { getPrismaClient } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';

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

      <div style={{ marginTop: 12 }}>
        <Link href="/admin/sources/new">New source</Link>
      </div>

      {sources.length === 0 ? (
        <div style={{ marginTop: 14, opacity: 0.8 }}>No sources yet.</div>
      ) : (
        <ul style={{ marginTop: 14, paddingLeft: 18, lineHeight: 1.8 }}>
          {sources.map((s) => (
            <li key={s.id}>
              <Link href={`/admin/sources/${s.id}`}>{s.name}</Link>{' '}
              <span style={{ opacity: 0.8 }}>
                · {s.enabled ? 'ENABLED' : 'DISABLED'} · {s.trustTier} · {s.licenseType} · slug{' '}
                <code>{s.sourceSlug}</code> · verified {formatDate(s.lastVerifiedAt)} · updated{' '}
                {formatDate(s.updatedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
