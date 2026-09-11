import type { Metadata } from 'next';

import { EntryListItem } from '@/components/EntryListItem';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { getRecentEntries } from '@/lib/publicData';
import {
  formatDate,
  formatRelativeDate,
  toIsoString,
} from '@/lib/publicFormat';

import styles from '../_styles/Browse.module.css';

// Reads searchParams (page).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Recently updated',
  description: 'Published SynAc entries ordered by their most recent update.',
  alternates: { canonical: '/recent' },
};

const PAGE_SIZE = 50;

export default async function RecentPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  const { items, total } = await getRecentEntries({
    page,
    pageSize: PAGE_SIZE,
  });
  const now = new Date();

  const prevHref = page > 1 ? `/recent?page=${page - 1}` : undefined;
  const nextHref =
    page * PAGE_SIZE < total ? `/recent?page=${page + 1}` : undefined;

  return (
    <>
      <PageHeader
        badge="Discovery"
        title="Recently updated"
        subtitle="Published entries ordered by most recent updates."
      />

      {items.length === 0 ? (
        <EmptyState title="Nothing published yet">
          Entries appear here as soon as the first ones are published.
        </EmptyState>
      ) : (
        <>
          <ol className={styles.list}>
            {items.map((entry) => (
              <EntryListItem
                key={entry.id}
                entryType={entry.entryType}
                title={entry.displayTitle}
                href={
                  entry.entryType === 'TERM'
                    ? `/term/${entry.primarySlug}`
                    : `/acronym/${entry.primarySlug}`
                }
                meta={
                  <time
                    dateTime={toIsoString(entry.updatedAt)}
                    title={formatDate(entry.updatedAt)}
                  >
                    {formatRelativeDate(entry.updatedAt, now)}
                  </time>
                }
                summary={entry.summaryText}
                tags={entry.tags}
              />
            ))}
          </ol>
          <Pagination
            page={page}
            total={total}
            pageSize={PAGE_SIZE}
            prevHref={prevHref}
            nextHref={nextHref}
            unit="entries"
          />
        </>
      )}
    </>
  );
}
