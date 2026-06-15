import Link from 'next/link';

import { BrowseControls } from '@/components/BrowseControls';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import {
  buildBrowseHref,
  getBrowseLetters,
  loadBrowsePageData,
  normalizeBrowseLetter,
} from '@/lib/publicBrowse';

import styles from '../_styles/Browse.module.css';

export const revalidate = 300;

type AcronymsPageProps = {
  searchParams?: Promise<{ letter?: string; page?: string; tag?: string; sort?: string; q?: string }>;
};

const letters = getBrowseLetters();

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(value);
}

export default async function AcronymsPage({ searchParams }: AcronymsPageProps) {
  const params = (await searchParams) ?? {};

  const letter = normalizeBrowseLetter(params.letter);
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const pageSize = 50;
  const sort = params.sort === 'updated' ? 'updated' : 'title';
  const query = (params.q ?? '').trim();
  const rawTag = (params.tag ?? '').trim().toLowerCase();
  const { activeTag, tags, entries } = await loadBrowsePageData({
    entryType: 'ACRONYM',
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
          basePath: '/acronyms',
          letter,
          page: page - 1,
          sort,
          query,
          tagSlug: activeTag?.slug ?? null,
        })
      : undefined;
  const nextHref =
    entries.length === pageSize
      ? buildBrowseHref({
          basePath: '/acronyms',
          letter,
          page: page + 1,
          sort,
          query,
          tagSlug: activeTag?.slug ?? null,
        })
      : undefined;

  return (
    <>
      <PageHeader
        badge="Browse"
        title="Acronyms"
        subtitle="Alphabetical index of published acronym entries with tag filters and quick sort."
      />

      <nav className={styles.letters} aria-label="Acronym letters">
        {letters.map((l) => (
          <Link
            key={l}
            className={`${styles.letter} ${l === letter ? styles.letterActive : ''}`}
            href={buildBrowseHref({
              basePath: '/acronyms',
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
        basePath="/acronyms"
        letter={letter}
        sort={sort}
        query={query}
        activeTagSlug={activeTag?.slug ?? null}
        tags={tags.map((t) => ({ name: t.name, slug: t.slug }))}
      />

      {entries.length === 0 ? (
        <div className={styles.empty}>
          No published acronyms yet for <strong>{letter.toUpperCase()}</strong>.
        </div>
      ) : (
        <>
          <ol className={styles.list}>
            {entries.map((entry) => (
              <li key={entry.id} className={styles.item}>
                <div className={styles.itemTitleRow}>
                  <div className={styles.itemTitleLeft}>
                    <span className={`${styles.typeBadge} ${styles.typeBadgeAcronym}`}>
                      ACRONYM
                    </span>
                    <Link className={styles.itemTitle} href={`/acronym/${entry.primarySlug}`}>
                      {entry.displayTitle}
                    </Link>
                  </div>
                  <span className={styles.itemSlug}>Updated {formatDate(entry.updatedAt)}</span>
                </div>
                {entry.summaryText ? (
                  <p className={styles.itemSummary}>{entry.summaryText}</p>
                ) : null}
                {entry.entryTags.length ? (
                  <div className={styles.itemTags}>
                    {entry.entryTags.map(({ tag }) => (
                      <Link key={tag.id} href={`/tags/${tag.slug}`} className={styles.tag}>
                        {tag.name}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
          <Pagination page={page} prevHref={prevHref} nextHref={nextHref} />
        </>
      )}
    </>
  );
}
