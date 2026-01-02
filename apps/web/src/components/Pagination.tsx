import Link from 'next/link';

import styles from './Pagination.module.css';

type PaginationProps = {
  page: number;
  prevHref?: string;
  nextHref?: string;
};

export function Pagination({ page, prevHref, nextHref }: PaginationProps) {
  const hasPrev = Boolean(prevHref);
  const hasNext = Boolean(nextHref);

  return (
    <nav className={styles.pager} aria-label="Pagination">
      <Link className={`${styles.link} ${!hasPrev ? styles.disabled : ''}`} href={prevHref ?? '#'}>
        Prev
      </Link>

      <span className={styles.status}>Page {page}</span>

      <Link className={`${styles.link} ${!hasNext ? styles.disabled : ''}`} href={nextHref ?? '#'}>
        Next
      </Link>
    </nav>
  );
}

