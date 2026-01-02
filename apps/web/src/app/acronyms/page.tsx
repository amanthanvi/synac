import Link from 'next/link';

import { getPrismaClient, listPublishedEntriesByLetter } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';

import styles from '../_styles/Browse.module.css';

export const dynamic = 'force-dynamic';

type AcronymsPageProps = {
  searchParams?: Promise<{ letter?: string; page?: string }>;
};

const letters = [...'abcdefghijklmnopqrstuvwxyz'.split(''), '0-9'];

export default async function AcronymsPage({ searchParams }: AcronymsPageProps) {
  const params = (await searchParams) ?? {};

  const letter = (params.letter ?? 'a').trim().toLowerCase();
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const pageSize = 50;

  const prisma = getPrismaClient();
  const entries = await listPublishedEntriesByLetter(prisma, {
    entryType: 'ACRONYM',
    letter,
    page,
    pageSize,
  });

  const prevHref =
    page > 1
      ? `/acronyms?letter=${encodeURIComponent(letter)}&page=${page - 1}`
      : undefined;
  const nextHref =
    entries.length === pageSize
      ? `/acronyms?letter=${encodeURIComponent(letter)}&page=${page + 1}`
      : undefined;

  return (
    <>
      <PageHeader
        badge="Browse"
        title="Acronyms"
        subtitle="Alphabetical index of published acronym entries. Acronym slugs are lowercase in URLs."
      />

      <nav className={styles.letters} aria-label="Acronym letters">
        {letters.map((l) => (
          <Link
            key={l}
            className={`${styles.letter} ${l === letter ? styles.letterActive : ''}`}
            href={`/acronyms?letter=${encodeURIComponent(l)}`}
          >
            {l}
          </Link>
        ))}
      </nav>

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
                  <Link className={styles.itemTitle} href={`/acronym/${entry.primarySlug}`}>
                    {entry.displayTitle}
                  </Link>
                  <span className={styles.itemSlug}>/acronym/{entry.primarySlug}</span>
                </div>
                {entry.summaryText ? (
                  <p className={styles.itemSummary}>{entry.summaryText}</p>
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
