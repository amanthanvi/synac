import Link from 'next/link';
import type { ReactNode } from 'react';

import { getPrismaClient, searchPublishedEntries } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { FocusSearchButton } from '@/components/FocusSearchButton';
import { ButtonLink } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';

import styles from '../_styles/Browse.module.css';
import layoutStyles from '../_styles/Layout.module.css';
import pageStyles from './page.module.css';

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

      <Panel className={layoutStyles.narrow}>
        <div className={pageStyles.queryPanel}>
          <div className={pageStyles.queryRow}>
            <div className={pageStyles.queryLabel}>Query</div>
            <div className={pageStyles.queryValue}>{query || '—'}</div>
          </div>
          <div className={pageStyles.queryActions}>
            <FocusSearchButton size="sm" variant="primary">
              Change query <span className={pageStyles.kbdInline}>/</span>
            </FocusSearchButton>
            <span className={pageStyles.queryHint}>
              Tip: <span className={pageStyles.kbdInline}>⌘K</span> for commands.
            </span>
          </div>
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
      <div className={`${styles.empty} ${pageStyles.resultsEmpty}`}>
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
      <ol className={`${styles.list} ${pageStyles.resultsList}`}>
        {results.map((r) => (
          <li key={r.id} className={styles.item}>
            <div className={styles.itemTitleRow}>
              <div className={styles.itemTitleLeft}>
                <span
                  className={`${styles.typeBadge} ${
                    r.entryType === 'TERM' ? styles.typeBadgeTerm : styles.typeBadgeAcronym
                  }`}
                >
                  {r.entryType}
                </span>
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
              </div>
              <span className={styles.itemSlug}>
                /{r.entryType === 'TERM' ? 'term' : 'acronym'}/{r.primarySlug}
              </span>
            </div>
            {r.entryType === 'ACRONYM' && (r.senseCount ?? 0) > 1 ? (
              <p className={pageStyles.senseSummary}>
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
