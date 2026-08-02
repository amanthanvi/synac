import { redirect } from 'next/navigation';

import { api, getConvexClient } from '@/lib/convex';
import { formatDate } from '@/lib/dates';
import { EntryRow, EntryRowList } from '@/components/EntryRow';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';

import layoutStyles from '../_styles/Layout.module.css';

export const revalidate = 300;

type RecentPageProps = {
  searchParams?: Promise<{ page?: string }>;
};

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
  const parsedPage = Math.floor(Number(sp.page ?? 1));
  const requestedPage = Number.isFinite(parsedPage) ? parsedPage : 1;
  if (requestedPage > maxPage) redirect(`/recent?page=${maxPage}`);
  const page = Math.max(1, requestedPage);

  const { entries, hasMore } = await getConvexClient().query(api.publicEntries.listRecent, {
    page,
    pageSize,
  });
  const now = new Date();

  const prevHref = page > 1 ? `/recent?page=${page - 1}` : undefined;
  const nextHref = page < maxPage && hasMore ? `/recent?page=${page + 1}` : undefined;

  return (
    <div className={layoutStyles.pageNarrow}>
      <PageHeader
        title="Recently updated"
        subtitle="Published entries ordered by most recent updates."
      />

      {entries.length === 0 ? (
        <p className={layoutStyles.bodyText}>No published entries yet.</p>
      ) : (
        <>
          <EntryRowList>
            {entries.map((entry) => {
              const updatedAt = new Date(entry.updatedAt);
              return (
                <EntryRow
                  key={entry.key}
                  href={
                    entry.entryType === 'TERM'
                      ? `/term/${entry.slug}`
                      : `/acronym/${entry.slug}`
                  }
                  title={entry.title}
                  entryType={entry.entryType}
                  summary={entry.summaryText}
                  meta={
                  <time
                    dateTime={updatedAt.toISOString()}
                    title={formatDate(updatedAt)}
                  >
                    {formatRelativeDate(updatedAt, now)}
                  </time>
                  }
                />
              );
            })}
          </EntryRowList>
          <Pagination page={page} prevHref={prevHref} nextHref={nextHref} />
        </>
      )}
    </div>
  );
}
