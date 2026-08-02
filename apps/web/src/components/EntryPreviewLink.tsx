import Link from 'next/link';

import { TypeMarker } from './ui/TypeMarker';
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
        <span className={styles.header}>
          <span className={styles.title}>{title}</span>
          <TypeMarker type={entryType} />
        </span>
        <span className={styles.summary}>
          {summary?.trim() ? summary.trim() : 'No summary yet.'}
        </span>
      </span>
    </span>
  );
}
