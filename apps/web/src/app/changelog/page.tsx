import { PageHeader } from '@/components/PageHeader';
import { CHANGELOG } from '@/lib/changelog';
import { ButtonLink } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';

import layoutStyles from '../_styles/Layout.module.css';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default function ChangelogPage() {
  return (
    <>
      <PageHeader
        badge="Updates"
        title="Changelog"
        subtitle="Versioned changes to SynAc."
      />

      <div className={`${layoutStyles.narrow} ${styles.wrap}`}>
        <div className={styles.toolbar}>
          <ButtonLink href="/changelog/rss.xml" size="sm">
            RSS
          </ButtonLink>
        </div>

        {CHANGELOG.length === 0 ? (
          <Panel className={styles.empty}>
            <p>No changelog entries yet.</p>
          </Panel>
        ) : (
          <ol className={styles.list}>
            {CHANGELOG.map((entry) => (
              <li
                key={entry.version}
                id={`v-${entry.version.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                className={styles.node}
              >
                <Panel className={styles.entry}>
                  <div className={styles.entryHeader}>
                    <div className={styles.badges}>
                      <div className={styles.versionBadge}>{entry.version}</div>
                      <div className={styles.dateBadge}>{entry.date}</div>
                    </div>
                  </div>

                  <div className={styles.entryTitle}>{entry.title}</div>

                  {entry.sections.length ? (
                    <div className={styles.sections}>
                      {entry.sections.map((section) => (
                        <section key={section.title} className={styles.section}>
                          <div className={styles.sectionLabel}>{section.title}</div>
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
                    <div className={styles.muted}>No changes listed yet.</div>
                  )}
                </Panel>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
