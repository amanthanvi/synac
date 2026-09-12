import type { Metadata } from 'next';

import { PageHeader } from '@/components/PageHeader';
import { CHANGELOG, changelogAnchorId } from '@/lib/changelog';

import layoutStyles from '../_styles/Layout.module.css';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

const title = 'Changelog';
const description = 'Versioned changes to SynAc: what shipped, when, and why.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/changelog' },
  openGraph: { title, description, images: '/opengraph-image.png' },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: '/twitter-image.png',
  },
};

export default function ChangelogPage() {
  return (
    <div className={layoutStyles.pageNarrow}>
      <div className={styles.head}>
        <PageHeader title="Changelog" subtitle="Versioned changes to SynAc." />
        <a className={styles.rss} href="/changelog/rss.xml">
          RSS
        </a>
      </div>

      {CHANGELOG.length === 0 ? (
        <p className={styles.muted}>No changelog entries yet.</p>
      ) : (
        <ol className={styles.list}>
          {CHANGELOG.map((entry) => (
            <li
              key={entry.version}
              id={changelogAnchorId(entry.version)}
              className={styles.entry}
            >
              <div className={styles.entryHeader}>
                <span className={styles.version}>{entry.version}</span>
                <span className={styles.date}>{entry.date}</span>
              </div>

              <h2 className={styles.entryTitle}>{entry.title}</h2>

              {entry.sections.length ? (
                <div className={styles.sections}>
                  {entry.sections.map((section) => (
                    <section key={section.title} className={styles.section}>
                      <h3 className={styles.sectionLabel}>{section.title}</h3>
                      {section.items.length ? (
                        <ul className={styles.items}>
                          {section.items.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      ) : null}
                    </section>
                  ))}
                </div>
              ) : (
                <p className={styles.muted}>No changes listed yet.</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
