import Link from 'next/link';

import { getPrismaClient } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';

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

function truncate(value: string, max: number): string {
  const v = value.trim().replaceAll(/\s+/g, ' ');
  if (v.length <= max) return v;
  return `${v.slice(0, Math.max(0, max - 1))}…`;
}

export default async function AdminTakedownPage() {
  const prisma = getPrismaClient();
  const cases = await prisma.takedownCase.findMany({
    select: {
      id: true,
      status: true,
      requesterContact: true,
      requestText: true,
      createdAt: true,
      updatedAt: true,
      closedAt: true,
      source: { select: { id: true, name: true } },
      sourceDocument: { select: { id: true, canonicalUrl: true, url: true } },
      entry: { select: { id: true, entryType: true, displayTitle: true, primarySlug: true } },
      createdByUser: { select: { id: true, email: true } },
    },
    orderBy: [{ updatedAt: 'desc' }],
    take: 200,
  });

  return (
    <>
      <PageHeader badge="Admin" title="Takedown" subtitle="Track and execute takedown requests." />

      <div style={{ marginTop: 12 }}>
        <Link href="/admin/takedown/new">New takedown case</Link>
      </div>

      {cases.length === 0 ? (
        <div style={{ marginTop: 14, opacity: 0.8 }}>No takedown cases yet.</div>
      ) : (
        <ul style={{ marginTop: 14, paddingLeft: 18, lineHeight: 1.8 }}>
          {cases.map((c) => {
            const entryUrl =
              c.entry?.primarySlug && c.entry.entryType === 'TERM'
                ? `/term/${c.entry.primarySlug}`
                : c.entry?.primarySlug
                  ? `/acronym/${c.entry.primarySlug}`
                  : null;

            return (
              <li key={c.id} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Link href={`/admin/takedown/${c.id}`}>Case {c.id}</Link>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.8 }}>
                    {c.status}
                    {c.closedAt ? ` · closed ${formatDate(c.closedAt)}` : ''}
                    · updated {formatDate(c.updatedAt)}
                  </span>
                </div>

                <div style={{ marginTop: 6, opacity: 0.9 }}>
                  {truncate(c.requestText, 160)}
                  {c.requesterContact?.trim() ? (
                    <span style={{ opacity: 0.8 }}> · {truncate(c.requesterContact, 60)}</span>
                  ) : null}
                </div>

                <div style={{ marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap', opacity: 0.85 }}>
                  {c.source ? <Link href={`/admin/sources/${c.source.id}`}>Source: {c.source.name}</Link> : null}
                  {c.sourceDocument ? (
                    <a
                      href={c.sourceDocument.canonicalUrl ?? c.sourceDocument.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Source doc
                    </a>
                  ) : null}
                  {c.entry ? <Link href={`/admin/entries/${c.entry.id}`}>Entry: {c.entry.displayTitle}</Link> : null}
                  {entryUrl ? (
                    <a href={entryUrl} target="_blank" rel="noopener noreferrer">
                      Public
                    </a>
                  ) : null}
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    by {c.createdByUser.email}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

