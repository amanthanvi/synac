import Link from 'next/link';

import { getPrismaClient, searchPublishedEntries } from '@synac/db';

import { renderHeadline } from '@/lib/highlight';
import { EntryRow, EntryRowList } from '@/components/EntryRow';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { SearchForm } from '@/components/SearchForm';

import pageStyles from './page.module.css';

export const dynamic = 'force-dynamic';

type SearchPageProps = {
  searchParams?: Promise<{ q?: string; page?: string; type?: string }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = (await searchParams) ?? {};
  const query = (params.q ?? '').trim().slice(0, 120);
  const normalizedQuery = query.toLowerCase().replace(/\s+/g, ' ').trim();
  const isIgnoredQuery =
    normalizedQuery.length <= 1 ||
    normalizedQuery === 'a' ||
    normalizedQuery === 'an' ||
    normalizedQuery === 'and' ||
    normalizedQuery === 'or' ||
    normalizedQuery === 'the';
  const page = Math.max(1, Math.min(10, Number(params.page ?? 1) || 1));
  const entryType =
    params.type?.toUpperCase() === 'TERM'
      ? 'TERM'
      : params.type?.toUpperCase() === 'ACRONYM'
        ? 'ACRONYM'
        : undefined;

  const filters: Array<{ label: string; href: string; active: boolean }> = [
    { label: 'All', href: `/search?q=${encodeURIComponent(query)}`, active: !entryType },
    {
      label: 'Terms',
      href: `/search?q=${encodeURIComponent(query)}&type=TERM`,
      active: entryType === 'TERM',
    },
    {
      label: 'Acronyms',
      href: `/search?q=${encodeURIComponent(query)}&type=ACRONYM`,
      active: entryType === 'ACRONYM',
    },
  ];

  return (
    <div className={pageStyles.wrap}>
      <PageHeader title="Search" />

      <div className={pageStyles.form}>
        <SearchForm key={query} defaultValue={query} size="lg" />
      </div>

      {!query || isIgnoredQuery ? (
        <div className={pageStyles.guidance}>
          {isIgnoredQuery ? (
            <p>Try a more specific query, or browse the index:</p>
          ) : (
            <p>Search published entries by title, alias, expansion, summary, or definition.</p>
          )}
          <p className={pageStyles.browseLinks}>
            Browse <Link href="/terms">terms</Link>, <Link href="/acronyms">acronyms</Link>, or{' '}
            <Link href="/tags">tags</Link>.
          </p>
        </div>
      ) : (
        <>
          <nav className={pageStyles.filters} aria-label="Filter by entry type">
            {filters.map((filter) => (
              <Link
                key={filter.label}
                href={filter.href}
                aria-current={filter.active ? 'true' : undefined}
                className={
                  filter.active
                    ? `${pageStyles.filter} ${pageStyles.filterActive}`
                    : pageStyles.filter
                }
              >
                {filter.label}
              </Link>
            ))}
          </nav>

          <Results query={query} page={page} entryType={entryType} />
        </>
      )}
    </div>
  );
}

async function Results({
  query,
  page,
  entryType,
}: {
  query: string;
  page: number;
  entryType?: 'TERM' | 'ACRONYM';
}) {
  const prisma = getPrismaClient();
  const pageSize = 20;
  const results = await searchPublishedEntries(prisma, {
    query,
    page,
    pageSize,
    entryType,
  });

  if (results.length === 0) {
    return (
      <p className={pageStyles.empty}>
        No results for <strong>{query}</strong>. Try a different spelling, or browse{' '}
        <Link href="/terms">terms</Link> and <Link href="/acronyms">acronyms</Link> by letter.
      </p>
    );
  }

  const baseHref = `/search?q=${encodeURIComponent(query)}${
    entryType ? `&type=${encodeURIComponent(entryType)}` : ''
  }`;
  const prevHref = page > 1 ? `${baseHref}&page=${page - 1}` : undefined;
  const nextHref = results.length === pageSize ? `${baseHref}&page=${page + 1}` : undefined;

  return (
    <>
      <EntryRowList>
        {results.map((r) => (
          <EntryRow
            key={r.id}
            href={r.entryType === 'TERM' ? `/term/${r.primarySlug}` : `/acronym/${r.primarySlug}`}
            title={r.displayTitle}
            entryType={r.entryType}
            meta={
              r.entryType === 'ACRONYM' && (r.senseCount ?? 0) > 1
                ? `${r.senseCount} meanings`
                : undefined
            }
            summary={
              // Title matches (buckets 1-2) produce a redundant snippet — the
              // search document starts with the title — so sense labels win
              // there; for content matches (bucket 3) the highlighted snippet
              // explains why the result matched.
              r.entryType === 'ACRONYM' && (r.senseCount ?? 0) > 1 && r.senseSummary && r.bucket < 3 ? (
                r.senseSummary
              ) : r.snippet ? (
                renderHeadline(r.snippet)
              ) : r.entryType === 'ACRONYM' && (r.senseCount ?? 0) > 1 && r.senseSummary ? (
                r.senseSummary
              ) : (
                (r.summaryText ?? undefined)
              )
            }
          />
        ))}
      </EntryRowList>
      <Pagination page={page} prevHref={prevHref} nextHref={nextHref} />
    </>
  );
}
