import Link from 'next/link';

import styles from './Pagination.module.css';

type PaginationProps = {
  page: number;
  /** Total matching rows. With `pageSize`, drives "Page N of M · X results". */
  total: number;
  pageSize: number;
  prevHref?: string;
  nextHref?: string;
  /** Noun for the result count, e.g. "entries". */
  unit?: string;
};

export function Pagination({
  page,
  total,
  pageSize,
  prevHref,
  nextHref,
  unit = 'results',
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));

  return (
    <nav className={styles.pager} aria-label="Pagination">
      {prevHref ? (
        <Link className={styles.link} href={prevHref} rel="prev">
          Prev
        </Link>
      ) : (
        <span
          className={`${styles.link} ${styles.disabled}`}
          aria-disabled="true"
        >
          Prev
        </span>
      )}

      <span className={styles.status}>
        Page {page} of {totalPages} · {total.toLocaleString()} {unit}
      </span>

      {nextHref ? (
        <Link className={styles.link} href={nextHref} rel="next">
          Next
        </Link>
      ) : (
        <span
          className={`${styles.link} ${styles.disabled}`}
          aria-disabled="true"
        >
          Next
        </span>
      )}
    </nav>
  );
}
