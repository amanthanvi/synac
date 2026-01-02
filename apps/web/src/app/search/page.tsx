import Link from 'next/link';

import { getPrismaClient, searchPublishedEntries } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';
import { SearchForm } from '@/components/SearchForm';

import styles from '../_styles/Browse.module.css';

export const dynamic = 'force-dynamic';

type SearchPageProps = {
  searchParams?: Promise<{ q?: string; page?: string; type?: string }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = (await searchParams) ?? {};
  const query = (params.q ?? '').trim();
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

      {!query ? (
        <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <Link href="/terms?letter=a">Browse terms</Link>
          <Link href="/acronyms?letter=a">Browse acronyms</Link>
          <Link href="/tags">Browse tags</Link>
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
  const results = await searchPublishedEntries(prisma, {
    query,
    page,
    pageSize: 20,
    entryType,
  });

  if (results.length === 0) {
    return (
      <div className={styles.empty} style={{ marginTop: 14 }}>
        No results for <strong>{query}</strong>. Try a different spelling or browse by letter.
      </div>
    );
  }

  return (
    <ol className={styles.list} style={{ marginTop: 14 }}>
      {results.map((r) => (
        <li key={r.id} className={styles.item}>
          <div className={styles.itemTitleRow}>
            <Link
              className={styles.itemTitle}
              href={r.entryType === 'TERM' ? `/term/${r.primarySlug}` : `/acronym/${r.primarySlug}`}
            >
              {r.displayTitle}
            </Link>
            <span className={styles.itemSlug}>{r.entryType}</span>
          </div>
          {r.summaryText ? <p className={styles.itemSummary}>{r.summaryText}</p> : null}
        </li>
      ))}
    </ol>
  );
}
