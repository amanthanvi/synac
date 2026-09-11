import type { Metadata } from 'next';
import { senseHeadingText } from '@/lib/publicEntryPage';
import { headers } from 'next/headers';
import Link from 'next/link';

import { readEntrySearch, readSenseSearch, type EntryType } from '@/lib/convex';
import { renderHeadline } from '@/lib/highlight';
import { enforcePageRateLimit } from '@/lib/rateLimit';
import {
  MAX_QUERY_LENGTH,
  MAX_SEARCH_PAGE,
  SEARCH_PAGE_SIZE,
  isIgnoredSearchQuery,
  parseEntryTypeParam,
  parseSearchPage,
  parseSearchScope,
  type SearchScope,
} from '@/lib/searchQuery';
import { EntryRow, EntryRowList } from '@/components/EntryRow';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { SearchForm } from '@/components/SearchForm';

import pageStyles from './page.module.css';

// This route reads headers() for the rate limiter, and the root layout reads
// them for the CSP nonce anyway, so every render is dynamic: src/lib/convex.ts
// (unstable_cache, tag `content`) is the only caching layer for search reads.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Search',
  description:
    'Search SynAc for security terms and acronyms by title, alias, expansion, summary, or definition.',
  // Canonical carries no query string: every result page is one URL to crawlers.
  alternates: { canonical: '/search' },
  robots: { index: false, follow: true },
};

const SEARCH_INPUT_ID = 'search-page-input';

type SearchPageProps = {
  searchParams?: Promise<{
    q?: string;
    page?: string;
    type?: string;
    scope?: string;
  }>;
};

type SearchLocation = {
  query: string;
  entryType: EntryType | null;
  scope: SearchScope;
  page: number;
};

function searchHref(location: SearchLocation): string {
  const params = new URLSearchParams({ q: location.query });
  if (location.entryType) params.set('type', location.entryType);
  if (location.scope === 'senses') params.set('scope', 'senses');
  if (location.page > 1) params.set('page', String(location.page));
  return `/search?${params.toString()}`;
}

function BrowseLinks() {
  return (
    <p className={pageStyles.browseLinks}>
      Browse <Link href="/terms">terms</Link>,{' '}
      <Link href="/acronyms">acronyms</Link>, or <Link href="/tags">tags</Link>.
    </p>
  );
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = (await searchParams) ?? {};
  const query = (params.q ?? '').trim().slice(0, MAX_QUERY_LENGTH);
  const page = parseSearchPage(params.page);
  const entryType = parseEntryTypeParam(params.type);
  const scope = parseSearchScope(params.scope);
  const isIgnoredQuery = query !== '' && isIgnoredSearchQuery(query);
  const willSearch = query !== '' && !isIgnoredQuery;

  // Only a query that reaches the backend spends limiter budget; the empty and
  // ignored-query states never query Convex.
  const rateLimit = willSearch
    ? await enforcePageRateLimit(await headers())
    : { allowed: true, retryAfterSeconds: 0 };

  const typeFilters: Array<{ label: string; type: EntryType | null }> = [
    { label: 'All', type: null },
    { label: 'Terms', type: 'TERM' },
    { label: 'Acronyms', type: 'ACRONYM' },
  ];
  const scopes: Array<{ label: string; scope: SearchScope }> = [
    { label: 'Entries', scope: 'entries' },
    { label: 'Meanings', scope: 'senses' },
  ];

  return (
    <div className={pageStyles.wrap}>
      <PageHeader title="Search" />

      <div className={pageStyles.form}>
        <SearchForm
          key={query}
          defaultValue={query}
          inputId={SEARCH_INPUT_ID}
          size="lg"
        />
      </div>

      {!willSearch ? (
        <div className={pageStyles.guidance}>
          {isIgnoredQuery ? (
            <p>Try a more specific query, or browse the index:</p>
          ) : (
            <p>
              Search published entries by title, alias, expansion, summary, or
              definition.
            </p>
          )}
          <BrowseLinks />
        </div>
      ) : !rateLimit.allowed ? (
        <div className={pageStyles.guidance}>
          <p>
            Too many searches, try again in {rateLimit.retryAfterSeconds}{' '}
            {rateLimit.retryAfterSeconds === 1 ? 'second' : 'seconds'}.
          </p>
          <BrowseLinks />
        </div>
      ) : (
        <>
          <div className={pageStyles.controls}>
            <nav
              className={pageStyles.filters}
              aria-label="Filter by entry type"
            >
              {typeFilters.map((filter) => {
                const active = filter.type === entryType;
                return (
                  <Link
                    key={filter.label}
                    href={searchHref({
                      query,
                      entryType: filter.type,
                      scope,
                      page: 1,
                    })}
                    aria-current={active ? 'page' : undefined}
                    className={
                      active
                        ? `${pageStyles.filter} ${pageStyles.filterActive}`
                        : pageStyles.filter
                    }
                  >
                    {filter.label}
                  </Link>
                );
              })}
            </nav>

            <nav className={pageStyles.filters} aria-label="What to search">
              {scopes.map((option) => {
                const active = option.scope === scope;
                return (
                  <Link
                    key={option.label}
                    href={searchHref({
                      query,
                      entryType,
                      scope: option.scope,
                      page: 1,
                    })}
                    aria-current={active ? 'page' : undefined}
                    className={
                      active
                        ? `${pageStyles.filter} ${pageStyles.filterActive}`
                        : pageStyles.filter
                    }
                  >
                    {option.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {scope === 'senses' ? (
            <SenseResults query={query} page={page} entryType={entryType} />
          ) : (
            <EntryResults query={query} page={page} entryType={entryType} />
          )}
        </>
      )}
    </div>
  );
}

function ResultCount({
  total,
  query,
  noun,
}: {
  total: number;
  query: string;
  noun: string;
}) {
  // `total` is the backend's match count inside its 200-candidate scan, so the
  // line reports what this search returned and never a corpus-wide total.
  return (
    <p className={pageStyles.count}>
      {total} {total === 1 ? noun : `${noun}s`} for <strong>{query}</strong>
    </p>
  );
}

function EmptyResults({ query, scope }: { query: string; scope: SearchScope }) {
  return (
    <p className={pageStyles.empty}>
      No {scope === 'senses' ? 'meanings' : 'entries'} match{' '}
      <strong>{query}</strong>. Try a different spelling, or browse{' '}
      <Link href="/terms">terms</Link> and{' '}
      <Link href="/acronyms">acronyms</Link> by letter.
    </p>
  );
}

function pager(location: SearchLocation, hasMore: boolean) {
  return {
    prevHref:
      location.page > 1
        ? searchHref({ ...location, page: location.page - 1 })
        : undefined,
    nextHref:
      hasMore && location.page < MAX_SEARCH_PAGE
        ? searchHref({ ...location, page: location.page + 1 })
        : undefined,
  };
}

async function EntryResults({
  query,
  page,
  entryType,
}: {
  query: string;
  page: number;
  entryType: EntryType | null;
}) {
  const { results, total, hasMore } = await readEntrySearch(
    query,
    entryType,
    null,
    page,
    SEARCH_PAGE_SIZE,
  );

  if (results.length === 0)
    return <EmptyResults query={query} scope="entries" />;

  const { prevHref, nextHref } = pager(
    { query, entryType, scope: 'entries', page },
    hasMore,
  );

  return (
    <>
      <ResultCount total={total} query={query} noun="result" />
      <EntryRowList>
        {results.map((result) => {
          const multiSense = result.senseCount > 1;
          return (
            <EntryRow
              key={result.key}
              href={
                result.entryType === 'TERM'
                  ? `/term/${result.slug}`
                  : `/acronym/${result.slug}`
              }
              title={result.title}
              entryType={result.entryType}
              meta={multiSense ? `${result.senseCount} meanings` : undefined}
              summary={
                result.snippet
                  ? renderHeadline(result.snippet)
                  : multiSense && result.senseSummary
                    ? result.senseSummary
                    : (result.summaryText ?? undefined)
              }
            />
          );
        })}
      </EntryRowList>
      <Pagination page={page} prevHref={prevHref} nextHref={nextHref} />
    </>
  );
}

/** Two sources name a meaning well; past that the count carries the rest. */
function formatSourceNames(names: string[]): string | undefined {
  if (names.length === 0) return undefined;
  if (names.length <= 2) return names.join(' · ');
  return `${names.slice(0, 2).join(' · ')} +${names.length - 2}`;
}

async function SenseResults({
  query,
  page,
  entryType,
}: {
  query: string;
  page: number;
  entryType: EntryType | null;
}) {
  const { results, total, hasMore } = await readSenseSearch(
    query,
    entryType,
    page,
    SEARCH_PAGE_SIZE,
  );

  if (results.length === 0)
    return <EmptyResults query={query} scope="senses" />;

  const { prevHref, nextHref } = pager(
    { query, entryType, scope: 'senses', page },
    hasMore,
  );

  return (
    <>
      <ResultCount total={total} query={query} noun="meaning" />
      <EntryRowList>
        {results.map((result) => {
          const label = senseHeadingText(result, result.entryType);
          return (
            <EntryRow
              key={`${result.entryType}:${result.slug}:${result.senseKey}`}
              href={`${result.entryType === 'TERM' ? '/term' : '/acronym'}/${result.slug}#${result.anchor}`}
              title={result.title}
              entryType={result.entryType}
              // labelFallback is the source name, so an unlabelled sense would
              // print its provenance twice; the meta column already carries it.
              label={result.sourceNames.includes(label) ? undefined : label}
              meta={formatSourceNames(result.sourceNames)}
              summary={
                result.snippet ? renderHeadline(result.snippet) : undefined
              }
            />
          );
        })}
      </EntryRowList>
      <Pagination page={page} prevHref={prevHref} nextHref={nextHref} />
    </>
  );
}
