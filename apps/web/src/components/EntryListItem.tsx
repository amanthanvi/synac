import Link from 'next/link';
import type { ReactNode } from 'react';

import { TypeBadge } from './TypeBadge';
import styles from './EntryListItem.module.css';

type EntryListItemProps = {
  entryType: 'TERM' | 'ACRONYM';
  title: string;
  href: string;
  /** Right-aligned metadata: updated date, slug, result rank, and so on. */
  meta?: ReactNode;
  summary?: ReactNode;
  tags?: Array<{ id: string; name: string; slug: string }>;
  children?: ReactNode;
};

/**
 * The single row shape shared by home, /recent, /search, /terms, /acronyms,
 * /tags/[slug], and /sources/[slug].
 */
export function EntryListItem({
  entryType,
  title,
  href,
  meta,
  summary,
  tags,
  children,
}: EntryListItemProps) {
  return (
    <li className={styles.item}>
      <div className={styles.titleRow}>
        <div className={styles.titleLeft}>
          <TypeBadge entryType={entryType} />
          <Link className={styles.title} href={href}>
            {title}
          </Link>
        </div>
        {meta ? <span className={styles.meta}>{meta}</span> : null}
      </div>

      {summary ? <p className={styles.summary}>{summary}</p> : null}
      {children}

      {tags?.length ? (
        <div className={styles.tags}>
          {tags.map((tag) => (
            <Link
              key={tag.id}
              href={`/tags/${tag.slug}`}
              className={styles.tag}
            >
              {tag.name}
            </Link>
          ))}
        </div>
      ) : null}
    </li>
  );
}
