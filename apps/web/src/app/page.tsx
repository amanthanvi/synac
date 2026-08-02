import Link from 'next/link';

import { api, getConvexClient } from '@/lib/convex';
import { formatDate } from '@/lib/dates';
import { EntryRow, EntryRowList } from '@/components/EntryRow';
import { SearchForm } from '@/components/SearchForm';

import styles from './page.module.css';

export const revalidate = 300;

export default async function Home() {
  const { entries: recent } = await getConvexClient().query(api.publicEntries.listRecent, {
    page: 1,
    pageSize: 8,
  });

  return (
    <div className={styles.wrap}>
      <section className={styles.hero} aria-label="Glossary search">
        <h1 className={styles.title}>SynAc</h1>
        <p className={styles.subtitle}>
          A cybersecurity reference for terms and acronyms — with provenance and attribution.
        </p>

        <div className={styles.search}>
          <SearchForm size="lg" placeholder="Search terms and acronyms…" />
        </div>

        <p className={styles.quick} aria-label="Quick access">
          Browse <Link href="/terms">terms</Link>, <Link href="/acronyms">acronyms</Link>, or{' '}
          <Link href="/tags">tags</Link>.
        </p>
      </section>

      <section className={styles.recent} aria-label="Recently updated">
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Recently updated</h2>
          <Link className={styles.sectionLink} href="/recent">
            View all
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className={styles.empty}>No published entries yet.</p>
        ) : (
          <EntryRowList>
            {recent.map((entry) => (
              <EntryRow
                key={entry.key}
                href={
                  entry.entryType === 'TERM'
                    ? `/term/${entry.slug}`
                    : `/acronym/${entry.slug}`
                }
                title={entry.title}
                entryType={entry.entryType}
                summary={entry.summaryText}
                meta={formatDate(new Date(entry.updatedAt))}
              />
            ))}
          </EntryRowList>
        )}
      </section>
    </div>
  );
}
