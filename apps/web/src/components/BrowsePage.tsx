import Link from 'next/link';

import { readBrowsePage, type EntryType } from '@/lib/convex';
import { formatDate } from '@/lib/dates';
import { entryPath } from '@/lib/publicEntryPage';
import {
  BROWSE_LETTERS,
  buildBrowseHref,
  normalizeBrowseLetter,
  normalizeBrowsePage,
  normalizeBrowseSort,
  normalizeBrowseTag,
  type BrowseBasePath,
} from '@/lib/publicBrowse';
import { BrowseControls } from '@/components/BrowseControls';
import { EntryRow, EntryRowList } from '@/components/EntryRow';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';

import styles from '@/app/_styles/Browse.module.css';
import layoutStyles from '@/app/_styles/Layout.module.css';

export type BrowseSearchParams = {
  letter?: string;
  page?: string;
  tag?: string;
  sort?: string;
  q?: string;
};

const PAGE_SIZE = 50;

const BROWSE: Record<
  EntryType,
  {
    basePath: BrowseBasePath;
    title: string;
    subtitle: string;
    lettersLabel: string;
    plural: string;
  }
> = {
  TERM: {
    basePath: '/terms',
    title: 'Terms',
    subtitle: 'Alphabetical index of published term entries.',
    lettersLabel: 'Term letters',
    plural: 'terms',
  },
  ACRONYM: {
    basePath: '/acronyms',
    title: 'Acronyms',
    subtitle: 'Alphabetical index of published acronym entries.',
    lettersLabel: 'Acronym letters',
    plural: 'acronyms',
  },
};

export async function BrowsePage({
  entryType,
  searchParams,
}: {
  entryType: EntryType;
  searchParams?: Promise<BrowseSearchParams>;
}) {
  const config = BROWSE[entryType];
  const params = (await searchParams) ?? {};

  const letter = normalizeBrowseLetter(params.letter);
  const page = normalizeBrowsePage(params.page);
  const sort = normalizeBrowseSort(params.sort);
  const query = (params.q ?? '').trim();
  const requestedTag = normalizeBrowseTag(params.tag);

  const { activeTag, tags, entries, hasMore } = await readBrowsePage(
    entryType,
    letter,
    page,
    PAGE_SIZE,
    sort,
    query,
    requestedTag,
  );

  const tagSlug = activeTag?.slug ?? null;
  const hrefFor = (nextPage: number, nextLetter: string) =>
    buildBrowseHref({
      basePath: config.basePath,
      letter: nextLetter,
      page: nextPage,
      sort,
      query,
      tagSlug,
    });

  return (
    <div className={layoutStyles.pageNarrow}>
      <PageHeader title={config.title} subtitle={config.subtitle} />

      <nav className={styles.letters} aria-label={config.lettersLabel}>
        {BROWSE_LETTERS.map((l) => (
          <Link
            key={l}
            className={`${styles.letter} ${l === letter ? styles.letterActive : ''}`}
            aria-current={l === letter ? 'true' : undefined}
            href={hrefFor(1, l)}
          >
            {l}
          </Link>
        ))}
      </nav>

      <BrowseControls
        basePath={config.basePath}
        letter={letter}
        sort={sort}
        query={query}
        activeTagSlug={tagSlug}
        tags={tags.map((t) => ({ name: t.name, slug: t.slug }))}
      />

      {entries.length === 0 ? (
        <div className={styles.empty}>
          No published {config.plural} yet for{' '}
          <strong>{letter.toUpperCase()}</strong>.
        </div>
      ) : (
        <>
          <EntryRowList>
            {entries.map((entry) => (
              <EntryRow
                key={entry.key}
                href={entryPath(entryType, entry.slug)}
                title={entry.title}
                entryType={entryType}
                summary={entry.summaryText}
                meta={`Updated ${formatDate(new Date(entry.updatedAt))}`}
              />
            ))}
          </EntryRowList>
          <Pagination
            page={page}
            prevHref={page > 1 ? hrefFor(page - 1, letter) : undefined}
            nextHref={hasMore ? hrefFor(page + 1, letter) : undefined}
          />
        </>
      )}
    </div>
  );
}
