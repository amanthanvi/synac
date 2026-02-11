import Link from 'next/link';

import styles from './EntryPreviewLink.module.css';

export type EntryPreviewLinkProps = {
  href: string;
  title: string;
  entryType: 'TERM' | 'ACRONYM';
  summary?: string | null;
};

export function EntryPreviewLink({ href, title, entryType, summary }: EntryPreviewLinkProps) {
  return (
    <span className={styles.wrap}>
      <Link className={styles.link} href={href}>
        {title}
      </Link>
      <span className={styles.preview} role="tooltip" aria-hidden="true">
        <div className={styles.header}>
          <div className={styles.title}>{title}</div>
          <div
            className={`${styles.badge} ${
              entryType === 'ACRONYM' ? styles.badgeAcronym : styles.badgeTerm
            }`}
          >
            {entryType}
          </div>
        </div>
        <div className={styles.summary}>{summary?.trim() ? summary.trim() : 'No summary yet.'}</div>
      </span>
    </span>
  );
}

