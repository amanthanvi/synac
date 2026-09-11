import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { Suspense, type ReactNode } from 'react';

import { EntryListItem } from '@/components/EntryListItem';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { SearchForm } from '@/components/SearchForm';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { getSearchFallbacks, getSearchResults } from '@/lib/publicData';
import { enforcePageRateLimit } from '@/lib/rateLimit';

import styles from '../_styles/Browse.module.css';
import layoutStyles from '../_styles/Layout.module.css';
import pageStyles from './page.module.css';

// Reads searchParams (q, page, type).
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

type SearchPageProps = {
  searchParams?: Promise<{ q?: string; page?: string; type?: string }>;
};

export async function generateMetadata({
  searchParams,
}: SearchPageProps): Promise<Metadata> {
  const params = (await searchParams) ?? {};
  const query = (params.q ?? '').trim();

  return {
    title: query ? `Search: ${query}` : 'Search',
    description:
      'Search published SynAc entries by title, alias, expansion, summary, or definition.',
    // Search result pages are thin, near-duplicate, and infinite in number.
    robots: { index: false, follow: true },
  };
}

const IGNORED_QUERIES = new Set(['a', 'an', 'and', 'or', 'the']);

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = (await searchParams) ?? {};
  const query = (params.q ?? '').trim();
  const normalizedQuery = query.toLowerCase().replace(/\s+/g, ' ').trim();
  const isIgnoredQuery =
    normalizedQuery.length <= 1 || IGNORED_QUERIES.has(normalizedQuery);
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const entryType =
    params.type?.toUpperCase() === 'TERM'
      ? 'TERM'
      : params.type?.toUpperCase() === 'ACRONYM'
        ? 'ACRONYM'
        : undefined;

  return (
    <>
      <PageHeader
        badge="Search"
        title="Search"
        subtitle="Search published entries by title, aliases, expansions, summaries, and definitions."
      />

      <Panel className={layoutStyles.narrow}>
        <div className={pageStyles.queryPanel}>
          {/* The form is seeded with the current query so refining it does not
              mean retyping from scratch. */}
          <SearchForm defaultValue={query} placeholder="Refine your search…" />
          <span className={pageStyles.queryHint}>
            Tip: <span className={pageStyles.kbdInline}>⌘K</span> for commands,{' '}
            <span className={pageStyles.kbdInline}>/</span> to focus the header
            search.
          </span>
        </div>
      </Panel>

      {!query || isIgnoredQuery ? (
        <div className={pageStyles.section}>
          {isIgnoredQuery ? (
            <p className={styles.itemSummary}>
              Try a more specific query. Or jump into browsing:
            </p>
          ) : null}
          <div className={layoutStyles.row}>
            <ButtonLink href="/terms?letter=a" size="sm">
              Browse terms
            </ButtonLink>
            <ButtonLink href="/acronyms?letter=a" size="sm">
              Browse acronyms
            </ButtonLink>
            <ButtonLink href="/tags" size="sm">
              Browse tags
            </ButtonLink>
          </div>
        </div>
      ) : (
        <>
          <div className={pageStyles.filters}>
            <ButtonLink
              href={`/search?q=${encodeURIComponent(query)}`}
              size="sm"
              variant={!entryType ? 'primary' : 'ghost'}
            >
              All
            </ButtonLink>
            <ButtonLink
              href={`/search?q=${encodeURIComponent(query)}&type=TERM`}
              size="sm"
              variant={entryType === 'TERM' ? 'primary' : 'ghost'}
            >
              Terms
            </ButtonLink>
            <ButtonLink
              href={`/search?q=${encodeURIComponent(query)}&type=ACRONYM`}
              size="sm"
              variant={entryType === 'ACRONYM' ? 'primary' : 'ghost'}
            >
              Acronyms
            </ButtonLink>
          </div>

          <Suspense
            key={`${query}:${page}:${entryType ?? 'ALL'}`}
            fallback={<ResultsSkeleton />}
          >
            <Results query={query} page={page} entryType={entryType} />
          </Suspense>
        </>
      )}
    </>
  );
}

function ResultsSkeleton() {
  return (
    <div
      className={pageStyles.resultsList}
      aria-busy="true"
      aria-label="Loading results"
    >
      <div className={pageStyles.skeletonList} aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className={pageStyles.skeletonItem}>
            <div className={`skeleton ${pageStyles.skeletonTitle}`} />
            <div className={`skeleton ${pageStyles.skeletonLine}`} />
            <div className={`skeleton ${pageStyles.skeletonLineShort}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

async function NoResults({
  query,
  entryType,
}: {
  query: string;
  entryType?: 'TERM' | 'ACRONYM';
}) {
  const { suggestion, tags } = await getSearchFallbacks({ query, entryType });

  return (
    <EmptyState
      className={pageStyles.resultsEmpty}
      title={`No results for “${query}”`}
      actions={
        <>
          <ButtonLink href="/terms?letter=a" size="sm">
            Browse terms
          </ButtonLink>
          <ButtonLink href="/acronyms?letter=a" size="sm">
            Browse acronyms
          </ButtonLink>
        </>
      }
    >
      {suggestion ? (
        <p className={pageStyles.suggestion}>
          Did you mean{' '}
          <Link href={`/search?q=${encodeURIComponent(suggestion)}`}>
            {suggestion}
          </Link>
          ?
        </p>
      ) : (
        <p>Try a different spelling, a shorter query, or browse by letter.</p>
      )}

      {tags.length ? (
        <div className={pageStyles.relatedTags}>
          <span className={pageStyles.relatedTagsLabel}>Related tags</span>
          <div className={styles.itemTags}>
            {tags.map((tag) => (
              <Link
                key={tag.id}
                href={`/tags/${tag.slug}`}
                className={styles.tag}
              >
                {tag.name}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </EmptyState>
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
  const rate = await enforcePageRateLimit(await headers());
  if (!rate.allowed) {
    return (
      <EmptyState title="Too many searches">
        Try again in {rate.retryAfterSeconds} seconds.
      </EmptyState>
    );
  }

  const { items, total } = await getSearchResults({
    query,
    page,
    pageSize: PAGE_SIZE,
    entryType,
  });

  if (items.length === 0) {
    return <NoResults query={query} entryType={entryType} />;
  }

  const baseHref = `/search?q=${encodeURIComponent(query)}${
    entryType ? `&type=${encodeURIComponent(entryType)}` : ''
  }`;
  const prevHref = page > 1 ? `${baseHref}&page=${page - 1}` : undefined;
  const nextHref =
    page * PAGE_SIZE < total ? `${baseHref}&page=${page + 1}` : undefined;

  return (
    <>
      <ol className={`${styles.list} ${pageStyles.resultsList}`}>
        {items.map((result) => (
          <EntryListItem
            key={result.id}
            entryType={result.entryType}
            title={result.displayTitle}
            href={
              result.entryType === 'TERM'
                ? `/term/${result.primarySlug}`
                : `/acronym/${result.primarySlug}`
            }
            meta={`/${result.entryType === 'TERM' ? 'term' : 'acronym'}/${result.primarySlug}`}
            summary={
              result.snippet
                ? renderHeadline(result.snippet)
                : result.summaryText
            }
          >
            {result.entryType === 'ACRONYM' && (result.senseCount ?? 0) > 1 ? (
              <p className={pageStyles.senseSummary}>
                <strong>Meanings ({result.senseCount}):</strong>{' '}
                {result.senseSummary ?? 'Multiple published senses.'}
              </p>
            ) : null}
          </EntryListItem>
        ))}
      </ol>
      <Pagination
        page={page}
        total={total}
        pageSize={PAGE_SIZE}
        prevHref={prevHref}
        nextHref={nextHref}
      />
    </>
  );
}

/** `ts_headline` marks matches with `<<`/`>>`; turn those into `<mark>`. */
function renderHeadline(headline: string): ReactNode {
  const pieces: ReactNode[] = [];
  const tokens = headline.split(/(<<|>>)/g);
  let highlight = false;
  let key = 0;

  for (const token of tokens) {
    if (!token) continue;
    if (token === '<<') {
      highlight = true;
      continue;
    }
    if (token === '>>') {
      highlight = false;
      continue;
    }

    pieces.push(
      highlight ? (
        <mark key={key++}>{token}</mark>
      ) : (
        <span key={key++}>{token}</span>
      ),
    );
  }

  return <>{pieces}</>;
}
