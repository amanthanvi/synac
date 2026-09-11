import Link from 'next/link';
import type { ReactNode } from 'react';

import { TypeMarker } from './ui/TypeMarker';
import styles from './EntryRow.module.css';

export function EntryRowList({ children }: { children: ReactNode }) {
  return <ol className={styles.list}>{children}</ol>;
}

export function EntryRow({
  href,
  title,
  entryType,
  label,
  summary,
  meta,
}: {
  href: string;
  title: string;
  entryType: 'TERM' | 'ACRONYM';
  /** Sense-level rows name the meaning next to the headword; entry rows omit it. */
  label?: ReactNode;
  summary?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <li className={styles.row}>
      <div className={styles.titleRow}>
        <Link className={styles.title} href={href}>
          {title}
        </Link>
        <TypeMarker type={entryType} />
        {label ? <span className={styles.label}>{label}</span> : null}
        {meta ? <span className={styles.meta}>{meta}</span> : null}
      </div>
      {summary ? <p className={styles.summary}>{summary}</p> : null}
    </li>
  );
}
