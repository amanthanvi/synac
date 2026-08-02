import Link from 'next/link';

import { formatDate } from '@/lib/dates';
import { BrowseControls } from '@/components/BrowseControls';
import { EntryRow, EntryRowList } from '@/components/EntryRow';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import {
  buildBrowseHref,
  getBrowseLetters,
  loadBrowsePageData,
  normalizeBrowseLetter,
} from '@/lib/publicBrowse';

import styles from '../_styles/Browse.module.css';
import layoutStyles from '../_styles/Layout.module.css';

export const revalidate = 300;

type TermsPageProps = {
  searchParams?: Promise<{ letter?: string; page?: string; tag?: string; sort?: string; q?: string }>;
};

const letters = getBrowseLetters();

export default async function TermsPage({ searchParams }: TermsPageProps) {
  const params = (await searchParams) ?? {};

  const letter = normalizeBrowseLetter(params.letter);
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const pageSize = 50;
  const sort = params.sort === 'updated' ? 'updated' : 'title';
  const query = (params.q ?? '').trim();
  const rawTag = (params.tag ?? '').trim().toLowerCase();
  const { activeTag, tags, entries, hasMore } = await loadBrowsePageData({
    entryType: 'TERM',
    letter,
    page,
    pageSize,
    sort,
    query,
    rawTag,
  });

  const prevHref =
    page > 1
      ? buildBrowseHref({
          basePath: '/terms',
          letter,
          page: page - 1,
          sort,
          query,
          tagSlug: activeTag?.slug ?? null,
        })
      : undefined;
  const nextHref =
    hasMore
      ? buildBrowseHref({
          basePath: '/terms',
          letter,
          page: page + 1,
          sort,
          query,
          tagSlug: activeTag?.slug ?? null,
        })
      : undefined;

  return (
    <div className={layoutStyles.pageNarrow}>
      <PageHeader title="Terms" subtitle="Alphabetical index of published term entries." />

      <nav className={styles.letters} aria-label="Term letters">
        {letters.map((l) => (
          <Link
            key={l}
            className={`${styles.letter} ${l === letter ? styles.letterActive : ''}`}
            href={buildBrowseHref({
              basePath: '/terms',
              letter: l,
              page: 1,
              sort,
              query,
              tagSlug: activeTag?.slug ?? null,
            })}
          >
            {l}
          </Link>
        ))}
      </nav>

      <BrowseControls
        basePath="/terms"
        letter={letter}
        sort={sort}
        query={query}
        activeTagSlug={activeTag?.slug ?? null}
        tags={tags.map((t) => ({ name: t.name, slug: t.slug }))}
      />

      {entries.length === 0 ? (
        <div className={styles.empty}>
          No published terms yet for <strong>{letter.toUpperCase()}</strong>.
        </div>
      ) : (
        <>
          <EntryRowList>
            {entries.map((entry) => (
              <EntryRow
                key={entry.key}
                href={`/term/${entry.slug}`}
                title={entry.title}
                entryType="TERM"
                summary={entry.summaryText}
                meta={`Updated ${formatDate(new Date(entry.updatedAt))}`}
              />
            ))}
          </EntryRowList>
          <Pagination page={page} prevHref={prevHref} nextHref={nextHref} />
        </>
      )}
    </div>
  );
}
