import Link from 'next/link';

import { getPrismaClient } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';
import { ButtonLink } from '@/components/ui/Button';
import { requireAdminActor } from '@/lib/admin';

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

function truncate(value: string, max: number): string {
  const v = value.trim().replaceAll(/\s+/g, ' ');
  if (v.length <= max) return v;
  return `${v.slice(0, Math.max(0, max - 1))}…`;
}

export default async function AdminTakedownPage() {
  // Matches the detail page and every takedown mutation: this list exposes
  // complainant contact details and DMCA correspondence.
  const actor = await requireAdminActor();
  if (!actor.roleNames.includes('ADMIN')) {
    throw new Error('Only ADMIN can manage takedown');
  }

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

      <div className={layoutStyles.stack}>
        <div className={layoutStyles.row}>
          <ButtonLink href="/admin/takedown/new" size="sm" variant="primary">
            New takedown case
          </ButtonLink>
        </div>

        {cases.length === 0 ? (
          <div className={browseStyles.empty}>No takedown cases yet.</div>
        ) : (
          <ol className={browseStyles.list}>
            {cases.map((c) => {
              const entryUrl =
                c.entry?.primarySlug && c.entry.entryType === 'TERM'
                  ? `/term/${c.entry.primarySlug}`
                  : c.entry?.primarySlug
                    ? `/acronym/${c.entry.primarySlug}`
                    : null;

              return (
                <li key={c.id} className={browseStyles.item}>
                  <div className={browseStyles.itemTitleRow}>
                    <Link className={browseStyles.itemTitle} href={`/admin/takedown/${c.id}`}>
                      Case {c.id}
                    </Link>
                    <span className={browseStyles.itemSlug}>
                      {c.status}
                      {c.closedAt ? ` · closed ${formatDate(c.closedAt)}` : ''} · updated{' '}
                      {formatDate(c.updatedAt)}
                    </span>
                  </div>

                  <p className={browseStyles.itemSummary}>
                    {truncate(c.requestText, 160)}
                    {c.requesterContact?.trim() ? (
                      <span className={browseStyles.metaMuted}>
                        {' '}
                        · {truncate(c.requesterContact, 60)}
                      </span>
                    ) : null}
                  </p>

                  <div className={styles.caseMeta}>
                    {c.source ? (
                      <Link className={styles.inlineLink} href={`/admin/sources/${c.source.id}`}>
                        Source: {c.source.name}
                      </Link>
                    ) : null}
                    {c.sourceDocument ? (
                      <a
                        className={styles.inlineLink}
                        href={c.sourceDocument.canonicalUrl ?? c.sourceDocument.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Source doc
                      </a>
                    ) : null}
                    {c.entry ? (
                      <Link className={styles.inlineLink} href={`/admin/entries/${c.entry.id}`}>
                        Entry: {c.entry.displayTitle}
                      </Link>
                    ) : null}
                    {entryUrl ? (
                      <a className={styles.inlineLink} href={entryUrl} target="_blank" rel="noopener noreferrer">
                        Public
                      </a>
                    ) : null}
                    <span className={styles.caseBy}>by {c.createdByUser.email}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </>
  );
}
