import Link from 'next/link';

import { getPrismaClient } from '@synac/db';

import { BrowseControls } from '@/components/BrowseControls';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';

import styles from '../_styles/Browse.module.css';

export const dynamic = 'force-dynamic';

type TermsPageProps = {
  searchParams?: Promise<{ letter?: string; page?: string; tag?: string; sort?: string; q?: string }>;
};

const letters = [...'abcdefghijklmnopqrstuvwxyz'.split(''), '0-9'];

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(value);
}

function buildBrowseHref(input: {
  letter: string;
  page: number;
  sort: 'title' | 'updated';
  query: string;
  tagSlug: string | null;
}): string {
  const sp = new URLSearchParams();
  if (input.letter !== 'a') sp.set('letter', input.letter);
  if (input.page > 1) sp.set('page', String(input.page));
  if (input.sort !== 'title') sp.set('sort', input.sort);
  if (input.query.trim()) sp.set('q', input.query.trim());
  if (input.tagSlug) sp.set('tag', input.tagSlug);
  const qs = sp.toString();
  return qs ? `/terms?${qs}` : '/terms';
}

export default async function TermsPage({ searchParams }: TermsPageProps) {
  const params = (await searchParams) ?? {};

  const rawLetter = (params.letter ?? 'a').trim().toLowerCase();
  const letter = letters.includes(rawLetter) ? rawLetter : 'a';
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const pageSize = 50;
  const sort = params.sort === 'updated' ? 'updated' : 'title';
  const query = (params.q ?? '').trim();

  const prisma = getPrismaClient();

  const rawTag = (params.tag ?? '').trim().toLowerCase();
  const activeTag = rawTag
    ? await prisma.tag.findFirst({
        where: { slug: rawTag, deletedAt: null },
        select: { id: true, name: true, slug: true },
      })
    : null;

  const topTagAgg = await prisma.entryTag.groupBy({
    by: ['tagId'],
    where: {
      tag: { deletedAt: null },
      entry: { status: 'PUBLISHED', deletedAt: null, entryType: 'TERM' },
    },
    _count: { tagId: true },
    orderBy: { _count: { tagId: 'desc' } },
    take: 12,
  });

  const topTagIds = topTagAgg.map((row) => row.tagId);
  const topTags = topTagIds.length
    ? await prisma.tag.findMany({
        where: { id: { in: topTagIds }, deletedAt: null },
        select: { id: true, name: true, slug: true },
      })
    : [];

  const tagsById = new Map(topTags.map((t) => [t.id, t] as const));
  const tags = topTagIds
    .map((id) => tagsById.get(id))
    .filter((t): t is (typeof topTags)[number] => Boolean(t));
  if (activeTag && !tags.some((t) => t.id === activeTag.id)) {
    tags.unshift(activeTag);
  }

  const normalizedTitleFilter =
    letter === '0-9'
      ? {
          OR: [
            { normalizedTitle: { startsWith: '0' } },
            { normalizedTitle: { startsWith: '1' } },
            { normalizedTitle: { startsWith: '2' } },
            { normalizedTitle: { startsWith: '3' } },
            { normalizedTitle: { startsWith: '4' } },
            { normalizedTitle: { startsWith: '5' } },
            { normalizedTitle: { startsWith: '6' } },
            { normalizedTitle: { startsWith: '7' } },
            { normalizedTitle: { startsWith: '8' } },
            { normalizedTitle: { startsWith: '9' } },
          ],
        }
      : { normalizedTitle: { startsWith: letter } };

  const queryFilter = query
    ? {
        OR: [
          { normalizedTitle: { contains: query.toLowerCase() } },
          { displayTitle: { contains: query, mode: 'insensitive' as const } },
          { summaryText: { contains: query, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const entries = await prisma.entry.findMany({
    where: {
      entryType: 'TERM',
      status: 'PUBLISHED',
      deletedAt: null,
      ...normalizedTitleFilter,
      ...(activeTag ? { entryTags: { some: { tagId: activeTag.id } } } : {}),
      ...queryFilter,
    },
    select: {
      id: true,
      entryType: true,
      displayTitle: true,
      primarySlug: true,
      summaryText: true,
      updatedAt: true,
      entryTags: {
        where: { tag: { deletedAt: null } },
        select: { tag: { select: { id: true, name: true, slug: true } } },
        orderBy: [{ tag: { name: 'asc' } }],
      },
    },
    orderBy:
      sort === 'updated'
        ? [{ updatedAt: 'desc' }, { normalizedTitle: 'asc' }]
        : [{ normalizedTitle: 'asc' }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  const prevHref =
    page > 1
      ? buildBrowseHref({
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
        title="Terms"
        subtitle="Alphabetical index of published term entries with tag filters and quick sort."
      />

      <nav className={styles.letters} aria-label="Term letters">
        {letters.map((l) => (
          <Link
            key={l}
            className={`${styles.letter} ${l === letter ? styles.letterActive : ''}`}
            href={buildBrowseHref({
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
          <ol className={styles.list}>
            {entries.map((entry) => (
              <li key={entry.id} className={styles.item}>
                <div className={styles.itemTitleRow}>
                  <div className={styles.itemTitleLeft}>
                    <span className={`${styles.typeBadge} ${styles.typeBadgeTerm}`}>TERM</span>
                    <Link className={styles.itemTitle} href={`/term/${entry.primarySlug}`}>
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
