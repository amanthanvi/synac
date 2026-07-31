import Link from 'next/link';

import { EntryRow, EntryRowList } from '@/components/EntryRow';
import { SearchForm } from '@/components/SearchForm';

import styles from '../../page.module.css';
import { browseRowsFixture } from '../fixtures';

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(value);
}

export default function PreviewHome() {
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

        <EntryRowList>
          {browseRowsFixture.map((entry) => (
            <EntryRow
              key={entry.id}
              href="/preview/entry-acronym"
              title={entry.displayTitle}
              entryType={entry.entryType}
              summary={entry.summaryText}
              meta={formatDate(entry.updatedAt)}
            />
          ))}
        </EntryRowList>
      </section>
    </div>
  );
}
