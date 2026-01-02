import Link from 'next/link';

import { getPrismaClient, listPublishedEntriesByLetter } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';

import styles from '../_styles/Browse.module.css';

export const dynamic = 'force-dynamic';

type TermsPageProps = {
  searchParams?: Promise<{ letter?: string; page?: string }>;
};

const letters = [...'abcdefghijklmnopqrstuvwxyz'.split(''), '0-9'];

export default async function TermsPage({ searchParams }: TermsPageProps) {
  const params = (await searchParams) ?? {};

  const letter = (params.letter ?? 'a').trim().toLowerCase();
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const pageSize = 50;

  const prisma = getPrismaClient();
  const entries = await listPublishedEntriesByLetter(prisma, {
    entryType: 'TERM',
    letter,
    page,
    pageSize,
  });

  const prevHref =
    page > 1 ? `/terms?letter=${encodeURIComponent(letter)}&page=${page - 1}` : undefined;
  const nextHref =
    entries.length === pageSize
      ? `/terms?letter=${encodeURIComponent(letter)}&page=${page + 1}`
      : undefined;

  return (
    <>
      <PageHeader
        badge="Browse"
        title="Terms"
        subtitle="Alphabetical index of published term entries. Use the letter rail to jump."
      />

      <nav className={styles.letters} aria-label="Term letters">
        {letters.map((l) => (
          <Link
            key={l}
            className={`${styles.letter} ${l === letter ? styles.letterActive : ''}`}
            href={`/terms?letter=${encodeURIComponent(l)}`}
          >
            {l}
          </Link>
        ))}
      </nav>

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
                  <Link className={styles.itemTitle} href={`/term/${entry.primarySlug}`}>
                    {entry.displayTitle}
                  </Link>
                  <span className={styles.itemSlug}>/term/{entry.primarySlug}</span>
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
