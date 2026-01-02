import Link from 'next/link';

import { SearchForm } from './SearchForm';
import styles from './SiteHeader.module.css';

export function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link className={styles.brand} href="/">
          <span className={styles.brandMark}>SYNAC</span>
          <span className={styles.brandName}>SynAc</span>
        </Link>

        <nav className={styles.nav} aria-label="Primary">
          <Link href="/terms">Terms</Link>
          <Link href="/acronyms">Acronyms</Link>
          <Link href="/tags">Tags</Link>
          <Link href="/sources">Sources</Link>
          <Link href="/recent">Recent</Link>
          <Link href="/trending">Trending</Link>
        </nav>

        <div className={styles.spacer} />

        <div className={styles.search}>
          <SearchForm />
        </div>
      </div>
    </header>
  );
}

