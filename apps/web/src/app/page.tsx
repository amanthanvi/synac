import Link from 'next/link';

import { api, getConvexClient } from '@/lib/convex';
import { SearchForm } from '@/components/SearchForm';
import { ButtonLink } from '@/components/ui/Button';

import browseStyles from './_styles/Browse.module.css';
import styles from './page.module.css';

export const revalidate = 300;

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(value);
}

export default async function Home() {
  const { entries: recent } = await getConvexClient().query(api.publicEntries.listRecent, {
    page: 1,
    pageSize: 8,
  });

  return (
    <div className={styles.wrap}>
      <section className={styles.hero} aria-label="Glossary search">
        <h1 className={styles.title}>Search SynAc</h1>
        <p className={styles.subtitle}>
          Cybersecurity reference for terms and acronyms — with provenance and attribution.
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

        {recent.length === 0 ? (
          <div className={browseStyles.empty}>No published entries yet.</div>
        ) : (
          <ol className={browseStyles.list}>
            {recent.map((entry) => {
              const href =
                entry.entryType === 'TERM' ? `/term/${entry.slug}` : `/acronym/${entry.slug}`;

              return (
                <li key={entry.key} className={browseStyles.item}>
                  <div className={browseStyles.itemTitleRow}>
                    <div className={browseStyles.itemTitleLeft}>
                      <span
                        className={`${browseStyles.typeBadge} ${
                          entry.entryType === 'TERM'
                            ? browseStyles.typeBadgeTerm
                            : browseStyles.typeBadgeAcronym
                        }`}
                      >
                        {entry.entryType}
                      </span>
                      <Link className={browseStyles.itemTitle} href={href}>
                        {entry.title}
                      </Link>
                    </div>
                    <span className={browseStyles.itemSlug}>
                      Updated {formatDate(new Date(entry.updatedAt))}
                    </span>
                  </div>

                  {entry.summaryText ? (
                    <p className={browseStyles.itemSummary}>{entry.summaryText}</p>
                  ) : null}

                  {entry.tags.length ? (
                    <div className={browseStyles.itemTags}>
                      {entry.tags.map((tag) => (
                        <Link key={tag.slug} href={`/tags/${tag.slug}`} className={browseStyles.tag}>
                          {tag.name}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
