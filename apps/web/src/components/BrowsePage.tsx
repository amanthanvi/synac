import Link from 'next/link';

import { BrowseControls } from '@/components/BrowseControls';
import { EntryListItem } from '@/components/EntryListItem';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import styles from '@/app/_styles/Browse.module.css';
import {
  buildBrowseHref,
  getBrowseLetters,
  normalizeBrowseLetter,
} from '@/lib/publicBrowse';
import { getBrowseEntries } from '@/lib/publicData';
import { formatDate } from '@/lib/publicFormat';

export type BrowseSearchParams = {
  letter?: string;
  page?: string;
  tag?: string;
  sort?: string;
  q?: string;
};

type BrowseConfig = {
  basePath: '/terms' | '/acronyms';
  title: string;
  subtitle: string;
  lettersLabel: string;
  noun: string;
};

const CONFIG: Record<'TERM' | 'ACRONYM', BrowseConfig> = {
  TERM: {
    basePath: '/terms',
    title: 'Terms',
    subtitle:
      'Alphabetical index of published term entries with tag filters and quick sort.',
    lettersLabel: 'Term letters',
    noun: 'terms',
  },
  ACRONYM: {
    basePath: '/acronyms',
    title: 'Acronyms',
    subtitle:
      'Alphabetical index of published acronym entries with tag filters and quick sort.',
    lettersLabel: 'Acronym letters',
    noun: 'acronyms',
  },
};

const PAGE_SIZE = 50;
const letters = getBrowseLetters();

/**
 * Explain which filter emptied the list, so the reader knows what to relax.
 * The letter is always in play, so it is only named when nothing else is.
 */
function emptyReason(input: {
  noun: string;
  letter: string;
  query: string;
  tagName: string | null;
}): string {
  const filters: string[] = [];
  if (input.query) filters.push(`matching “${input.query}”`);
  if (input.tagName) filters.push(`tagged “${input.tagName}”`);

  if (filters.length === 0) {
    return `No published ${input.noun} start with ${input.letter.toUpperCase()}.`;
  }

  return `No published ${input.noun} starting with ${input.letter.toUpperCase()} are ${filters.join(
    ' and ',
  )}.`;
}

export async function BrowsePage({
  entryType,
  searchParams,
}: {
  entryType: 'TERM' | 'ACRONYM';
  searchParams: BrowseSearchParams;
}) {
  const config = CONFIG[entryType];

  const letter = normalizeBrowseLetter(searchParams.letter);
  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);
  const sort = searchParams.sort === 'updated' ? 'updated' : 'title';
  const query = (searchParams.q ?? '').trim();
  const rawTag = (searchParams.tag ?? '').trim().toLowerCase();

  const { activeTag, tags, items, total } = await getBrowseEntries({
    entryType,
    letter,
    page,
    pageSize: PAGE_SIZE,
    sort,
    query,
    tagSlug: rawTag || null,
  });

  const hrefFor = (targetPage: number) =>
    buildBrowseHref({
      basePath: config.basePath,
      letter,
      page: targetPage,
      sort,
      query,
      tagSlug: activeTag?.slug ?? null,
    });

  const prevHref = page > 1 ? hrefFor(page - 1) : undefined;
  const nextHref = page * PAGE_SIZE < total ? hrefFor(page + 1) : undefined;

  return (
    <>
      <PageHeader
        badge="Browse"
        title={config.title}
        subtitle={config.subtitle}
      />

      <nav className={styles.letters} aria-label={config.lettersLabel}>
        {letters.map((value) => (
          <Link
            key={value}
            className={`${styles.letter} ${value === letter ? styles.letterActive : ''}`}
            aria-current={value === letter ? 'page' : undefined}
            href={buildBrowseHref({
              basePath: config.basePath,
              letter: value,
              page: 1,
              sort,
              query,
              tagSlug: activeTag?.slug ?? null,
            })}
          >
            {value}
          </Link>
        ))}
      </nav>

      <BrowseControls
        basePath={config.basePath}
        letter={letter}
        sort={sort}
        query={query}
        activeTagSlug={activeTag?.slug ?? null}
        tags={tags.map((tag) => ({ name: tag.name, slug: tag.slug }))}
      />

      {items.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          actions={
            <>
              {query || activeTag ? (
                <ButtonLink
                  href={buildBrowseHref({
                    basePath: config.basePath,
                    letter,
                    page: 1,
                    sort,
                    query: '',
                    tagSlug: null,
                  })}
                  size="sm"
                >
                  Clear filters
                </ButtonLink>
              ) : null}
              <ButtonLink href={config.basePath} size="sm">
                Back to A
              </ButtonLink>
            </>
          }
        >
          {emptyReason({
            noun: config.noun,
            letter,
            query,
            tagName: activeTag?.name ?? null,
          })}
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
                meta={`Updated ${formatDate(entry.updatedAt)}`}
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
            unit={config.noun}
          />
        </>
      )}
    </>
  );
}
