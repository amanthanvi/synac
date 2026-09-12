import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { readRecentEntries } from '@/lib/convex';
import { formatDate } from '@/lib/dates';
import { EntryRow, EntryRowList } from '@/components/EntryRow';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';

import layoutStyles from '../_styles/Layout.module.css';

export const revalidate = 300;

const title = 'Recently updated';
const description = 'Published SynAc entries ordered by most recent update.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/recent' },
  openGraph: { title, description, images: '/opengraph-image.png' },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: '/twitter-image.png',
  },
};

type RecentPageProps = {
  searchParams?: Promise<{ page?: string }>;
};

const PAGE_SIZE = 50;
const MAX_PAGE = 4;

export default async function RecentPage({ searchParams }: RecentPageProps) {
  const sp = (await searchParams) ?? {};
  const parsedPage = Math.floor(Number(sp.page ?? 1));
  const requestedPage = Number.isFinite(parsedPage) ? parsedPage : 1;
  if (requestedPage > MAX_PAGE) redirect(`/recent?page=${MAX_PAGE}`);
  const page = Math.max(1, requestedPage);

  const { entries, hasMore } = await readRecentEntries(page, PAGE_SIZE);

  const prevHref = page > 1 ? `/recent?page=${page - 1}` : undefined;
  const nextHref =
    page < MAX_PAGE && hasMore ? `/recent?page=${page + 1}` : undefined;

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
                    <time dateTime={updatedAt.toISOString()}>
                      Updated {formatDate(updatedAt)}
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
