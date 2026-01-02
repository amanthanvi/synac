import Link from 'next/link';

import { getPrismaClient, listRecentPublishedEntries } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';

import styles from '../_styles/Browse.module.css';

export const dynamic = 'force-dynamic';

type RecentPageProps = {
  searchParams?: Promise<{ page?: string }>;
};

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(value);
}

export default async function RecentPage({ searchParams }: RecentPageProps) {
  const sp = (await searchParams) ?? {};
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  const prisma = getPrismaClient();
  const entries = await listRecentPublishedEntries(prisma, { page, pageSize: 50 });

  return (
    <>
      <PageHeader
        badge="Discovery"
        title="Recently updated"
        subtitle="Published entries ordered by most recent updates."
      />

      {entries.length === 0 ? (
        <div className={styles.empty}>No published entries yet.</div>
      ) : (
        <ol className={styles.list}>
          {entries.map((entry) => (
            <li key={entry.id} className={styles.item}>
              <div className={styles.itemTitleRow}>
                <Link
                  className={styles.itemTitle}
                  href={
                    entry.entryType === 'TERM'
                      ? `/term/${entry.primarySlug}`
                      : `/acronym/${entry.primarySlug}`
                  }
                >
                  {entry.displayTitle}
                </Link>
                <span className={styles.itemSlug}>{formatDate(entry.updatedAt)}</span>
              </div>
              {entry.summaryText ? (
                <p className={styles.itemSummary}>{entry.summaryText}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

