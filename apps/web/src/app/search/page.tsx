import Link from 'next/link';
import type { ReactNode } from 'react';

import { getPrismaClient, searchPublishedEntries } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { SearchForm } from '@/components/SearchForm';

import styles from '../_styles/Browse.module.css';

export const dynamic = 'force-dynamic';

type SearchPageProps = {
  searchParams?: Promise<{ q?: string; page?: string; type?: string }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = (await searchParams) ?? {};
  const query = (params.q ?? '').trim();
  const normalizedQuery = query.toLowerCase().replace(/\s+/g, ' ').trim();
  const isIgnoredQuery =
    normalizedQuery.length <= 1 ||
    normalizedQuery === 'a' ||
    normalizedQuery === 'an' ||
    normalizedQuery === 'and' ||
    normalizedQuery === 'or' ||
    normalizedQuery === 'the';
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

      <div style={{ maxWidth: 720 }}>
        <SearchForm defaultValue={query} placeholder="Search (e.g. SAML, SOC, zero trust)..." />
      </div>

      {!query || isIgnoredQuery ? (
        <div style={{ marginTop: 14 }}>
          {isIgnoredQuery ? (
            <p className={styles.itemSummary}>
              Try a more specific query. Or jump into browsing:
            </p>
          ) : null}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/terms?letter=a">Browse terms</Link>
            <Link href="/acronyms?letter=a">Browse acronyms</Link>
            <Link href="/tags">Browse tags</Link>
          </div>
        </div>
      ) : (
        <>
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href={`/search?q=${encodeURIComponent(query)}`}>All</Link>
            <Link href={`/search?q=${encodeURIComponent(query)}&type=TERM`}>Terms</Link>
            <Link href={`/search?q=${encodeURIComponent(query)}&type=ACRONYM`}>Acronyms</Link>
          </div>

          <Results query={query} page={page} entryType={entryType} />
        </>
      )}
    </>
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
      <div className={styles.empty} style={{ marginTop: 14 }}>
        No results for <strong>{query}</strong>. Try a different spelling or browse by letter.
      </div>
    );
  }

  const baseHref = `/search?q=${encodeURIComponent(query)}${
    entryType ? `&type=${encodeURIComponent(entryType)}` : ''
  }`;
  const prevHref = page > 1 ? `${baseHref}&page=${page - 1}` : undefined;
  const nextHref =
    results.length === pageSize ? `${baseHref}&page=${page + 1}` : undefined;

  return (
    <>
      <ol className={styles.list} style={{ marginTop: 14 }}>
        {results.map((r) => (
          <li key={r.id} className={styles.item}>
            <div className={styles.itemTitleRow}>
              <Link
                className={styles.itemTitle}
                href={
                  r.entryType === 'TERM'
                    ? `/term/${r.primarySlug}`
                    : `/acronym/${r.primarySlug}`
                }
              >
                {r.displayTitle}
              </Link>
              <span className={styles.itemSlug}>{r.entryType}</span>
            </div>
            {r.entryType === 'ACRONYM' && (r.senseCount ?? 0) > 1 ? (
              <p className={styles.itemSummary} style={{ marginTop: 6 }}>
                <strong>Meanings ({r.senseCount}):</strong>{' '}
                {r.senseSummary ?? 'Multiple published senses.'}
              </p>
            ) : null}
            {r.snippet ? (
              <p className={styles.itemSummary}>{renderHeadline(r.snippet)}</p>
            ) : r.summaryText ? (
              <p className={styles.itemSummary}>{r.summaryText}</p>
            ) : null}
          </li>
        ))}
      </ol>
      <Pagination page={page} prevHref={prevHref} nextHref={nextHref} />
    </>
  );
}

function renderHeadline(headline: string): ReactNode {
  const pieces: React.ReactNode[] = [];
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

    pieces.push(highlight ? <mark key={key++}>{token}</mark> : <span key={key++}>{token}</span>);
  }

  return <>{pieces}</>;
}
