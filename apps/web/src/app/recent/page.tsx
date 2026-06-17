import Link from 'next/link';

import { getPrismaClient, listRecentPublishedEntries, queryPublicConvex } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';

import styles from '../_styles/Browse.module.css';

export const revalidate = 300;

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

function formatRelativeDate(value: Date, now: Date): string {
  const diffMs = now.getTime() - value.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 7) return `${diffDays} days ago`;

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks === 1) return '1 week ago';
  if (diffWeeks < 5) return `${diffWeeks} weeks ago`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return '1 month ago';
  if (diffMonths < 12) return `${diffMonths} months ago`;

  const diffYears = Math.floor(diffDays / 365);
  return diffYears <= 1 ? '1 year ago' : `${diffYears} years ago`;
}

export default async function RecentPage({ searchParams }: RecentPageProps) {
  const sp = (await searchParams) ?? {};
  const pageSize = 50;
  const maxPage = 4;
  const page = Math.min(maxPage, Math.max(1, Number(sp.page ?? 1) || 1));

  const prisma = getPrismaClient();
  const entries = await listRecentPublishedEntries(prisma, { page, pageSize });
  const now = new Date();

  const entryIds = entries.map((e) => e.id);
  const entryTags = entryIds.length
    ? await queryPublicConvex<Array<{ entryId: string; tag: { id: string; name: string; slug: string } }>>(
        'listEntryTagsForEntries',
        { entryIds },
      )
    : [];

  const tagsByEntryId = new Map<string, Array<(typeof entryTags)[number]['tag']>>();
  for (const row of entryTags) {
    const list = tagsByEntryId.get(row.entryId) ?? [];
    list.push(row.tag);
    tagsByEntryId.set(row.entryId, list);
  }

  const prevHref = page > 1 ? `/recent?page=${page - 1}` : undefined;
  const nextHref = page < maxPage && entries.length === pageSize ? `/recent?page=${page + 1}` : undefined;

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
        <>
          <ol className={styles.list}>
            {entries.map((entry) => (
              <li key={entry.id} className={styles.item}>
                <div className={styles.itemTitleRow}>
                  <div className={styles.itemTitleLeft}>
                    <span
                      className={`${styles.typeBadge} ${
                        entry.entryType === 'TERM'
                          ? styles.typeBadgeTerm
                          : styles.typeBadgeAcronym
                      }`}
                    >
                      {entry.entryType}
                    </span>
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
                  </div>
                  <span className={styles.itemSlug}>
                    <time dateTime={entry.updatedAt.toISOString()} title={formatDate(entry.updatedAt)}>
                      {formatRelativeDate(entry.updatedAt, now)}
                    </time>
                  </span>
                </div>
                {entry.summaryText ? (
                  <p className={styles.itemSummary}>{entry.summaryText}</p>
                ) : null}
                {(tagsByEntryId.get(entry.id) ?? []).length ? (
                  <div className={styles.itemTags}>
                    {(tagsByEntryId.get(entry.id) ?? []).map((tag) => (
                      <Link key={tag.id} href={`/tags/${tag.slug}`} className={styles.tag}>
                        {tag.name}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
          <Pagination page={page} prevHref={prevHref} nextHref={nextHref} />
        </>
      )}
    </>
  );
}
