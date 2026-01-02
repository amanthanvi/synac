import Link from 'next/link';

import { getPrismaClient, listTrendingEntries } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';

import styles from '../_styles/Browse.module.css';

export const dynamic = 'force-dynamic';

export default async function TrendingPage() {
  const prisma = getPrismaClient();
  const entries = await listTrendingEntries(prisma, { windowDays: 7, limit: 50 });

  return (
    <>
      <PageHeader
        badge="Discovery"
        title="Trending"
        subtitle="Trending is computed from privacy-aware aggregated page views (7 days)."
      />

      {entries.length === 0 ? (
        <div className={styles.empty}>
          No trending data yet. Visit some entry pages, or use{' '}
          <Link href="/recent">recent updates</Link>.
        </div>
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
                <span className={styles.itemSlug}>{entry.views} views</span>
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
