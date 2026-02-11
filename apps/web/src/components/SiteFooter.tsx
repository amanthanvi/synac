import Link from 'next/link';

import styles from './SiteFooter.module.css';

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.meta}>
          © {new Date().getFullYear()} SynAc · MIT Licensed
        </div>
        <div className={styles.links}>
          <Link href="/about">About</Link>
          <Link href="/legal/privacy">Privacy</Link>
          <Link href="/legal/terms">Terms</Link>
          <Link href="/changelog">Changelog</Link>
          <a
            href="https://github.com/amanthanvi/synac"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
