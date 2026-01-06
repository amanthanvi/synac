import Link from 'next/link';
import Image from 'next/image';

import { SearchForm } from './SearchForm';
import styles from './SiteHeader.module.css';

export function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link className={styles.brand} href="/">
          <Image
            className={styles.brandIcon}
            src="/brand/synac-icon.svg"
            alt=""
            aria-hidden="true"
            width={28}
            height={28}
            priority
          />
          <span className={styles.brandName}>SynAc</span>
        </Link>

        <nav className={styles.nav} aria-label="Primary">
          <div className={styles.navDesktop}>
            <details className={styles.dropdown}>
              <summary className={styles.dropdownSummary}>Explore</summary>
              <div className={styles.dropdownPanel}>
                <Link className={styles.dropdownLink} href="/terms">
                  Terms
                </Link>
                <Link className={styles.dropdownLink} href="/acronyms">
                  Acronyms
                </Link>
                <Link className={styles.dropdownLink} href="/tags">
                  Tags
                </Link>
                <Link className={styles.dropdownLink} href="/recent">
                  Recent
                </Link>
                <Link className={styles.dropdownLink} href="/trending">
                  Trending
                </Link>
              </div>
            </details>

            <Link className={styles.navLink} href="/sources">
              Sources
            </Link>
            <Link className={styles.navLink} href="/about">
              About
            </Link>
          </div>

          <details className={styles.navMobile}>
            <summary className={styles.mobileSummary} aria-label="Open menu">
              Menu
            </summary>
            <div className={styles.mobilePanel}>
              <Link className={styles.mobileLink} href="/terms">
                Terms
              </Link>
              <Link className={styles.mobileLink} href="/acronyms">
                Acronyms
              </Link>
              <Link className={styles.mobileLink} href="/tags">
                Tags
              </Link>
              <Link className={styles.mobileLink} href="/sources">
                Sources
              </Link>
              <Link className={styles.mobileLink} href="/recent">
                Recent
              </Link>
              <Link className={styles.mobileLink} href="/trending">
                Trending
              </Link>
              <Link className={styles.mobileLink} href="/about">
                About
              </Link>
            </div>
          </details>
        </nav>

        <div className={styles.spacer} />

        <div className={styles.search}>
          <SearchForm />
        </div>
      </div>
    </header>
  );
}
