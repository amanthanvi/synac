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
  summary,
  meta,
}: {
  href: string;
  title: string;
  entryType: 'TERM' | 'ACRONYM';
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
        {meta ? <span className={styles.meta}>{meta}</span> : null}
      </div>
      {summary ? <p className={styles.summary}>{summary}</p> : null}
    </li>
  );
}
