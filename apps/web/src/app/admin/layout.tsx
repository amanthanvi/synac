import { UserButton } from '@clerk/nextjs';
import Link from 'next/link';

import { requireAdminActor } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireAdminActor();

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          paddingBottom: 12,
          borderBottom: '1px solid var(--border)',
          flexWrap: 'wrap',
        }}
      >
        <nav aria-label="Admin">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <Link href="/admin">Dashboard</Link>
            <Link href="/admin/entries">Entries</Link>
            <Link href="/admin/sources">Sources</Link>
            <Link href="/admin/tags">Tags</Link>
            <Link href="/admin/ingest">Ingest</Link>
            <Link href="/admin/takedown">Takedown</Link>
            <Link href="/admin/audit">Audit</Link>
          </div>
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.8 }}>
            {actor.email} · {actor.roleNames.join(', ')}
          </div>
          <UserButton afterSignOutUrl="/" />
        </div>
      </div>

      {children}
    </div>
  );
}
