import Link from 'next/link';

import styles from './Pagination.module.css';

type PaginationProps = {
  page: number;
  prevHref?: string;
  nextHref?: string;
};

export function Pagination({ page, prevHref, nextHref }: PaginationProps) {
  return (
    <nav className={styles.pager} aria-label="Pagination">
      {prevHref ? (
        <Link className={styles.link} href={prevHref} rel="prev">
          Prev
        </Link>
      ) : (
        <span className={`${styles.link} ${styles.disabled}`} aria-disabled="true">
          Prev
        </span>
      )}

      <span className={styles.status}>Page {page}</span>

      {nextHref ? (
        <Link className={styles.link} href={nextHref} rel="next">
          Next
        </Link>
      ) : (
        <span className={`${styles.link} ${styles.disabled}`} aria-disabled="true">
          Next
        </span>
      )}
    </nav>
  );
}
