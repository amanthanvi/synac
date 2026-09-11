import type { Metadata } from 'next';
import Link from 'next/link';

import { EntryListItem } from '@/components/EntryListItem';
import { SearchForm } from '@/components/SearchForm';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { getRecentEntries } from '@/lib/publicData';
import { formatDate } from '@/lib/publicFormat';

import browseStyles from './_styles/Browse.module.css';
import styles from './page.module.css';

// DB-backed with no searchParams. Kept dynamic because `next build` runs in
// environments without DATABASE_URL (e.g. the CodeQL workflow), so this route
// must not be prerendered. Freshness still comes from the `unstable_cache`
// tags in lib/publicData.ts, which `revalidateTag` invalidates on publish.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'SynAc: cybersecurity terms and acronyms',
  description:
    'A cybersecurity reference for terms and acronyms, with per-sense provenance and source attribution.',
  alternates: { canonical: '/' },
};

export default async function Home() {
  const { items } = await getRecentEntries({ page: 1, pageSize: 8 });

  return (
    <div className={styles.wrap}>
      <section className={styles.hero} aria-label="Glossary search">
        <h1 className={styles.title}>Search SynAc</h1>
        <p className={styles.subtitle}>
          Cybersecurity reference for terms and acronyms, with provenance and
          attribution.
        </p>

        <div className={styles.search}>
          <SearchForm size="lg" placeholder="Search terms and acronyms…" />
        </div>

        <div className={styles.quick} aria-label="Quick access">
          <ButtonLink href="/terms" variant="ghost">
            Browse terms
          </ButtonLink>
          <ButtonLink href="/acronyms" variant="ghost">
            Browse acronyms
          </ButtonLink>
          <ButtonLink href="/tags" variant="ghost">
            Tags
          </ButtonLink>
        </div>
      </section>

      <section className={styles.recent} aria-label="Recently updated">
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Recently updated</h2>
          <Link className={styles.sectionLink} href="/recent">
            View all
          </Link>
        </div>

        {items.length === 0 ? (
          <EmptyState title="Nothing published yet">
            Entries appear here as soon as the first ones are published.
          </EmptyState>
        ) : (
          <ol className={browseStyles.list}>
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
        )}
      </section>
    </div>
  );
}
