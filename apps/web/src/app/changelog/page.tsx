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
              >
                <Panel className={styles.entry}>
                  <div className={styles.entryHeader}>
                    <div className={styles.entryVersion}>{entry.version}</div>
                    <div className={styles.entryDate}>{entry.date}</div>
                  </div>

                  <div className={styles.entryTitle}>{entry.title}</div>

                  {entry.items.length ? (
                    <ul className={styles.items}>
                      {entry.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                </Panel>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
