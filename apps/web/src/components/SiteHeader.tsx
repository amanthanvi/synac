import Link from 'next/link';

import { MobileNav } from './MobileNav';
import { SearchPalette } from './SearchPalette';
import { ThemeToggle } from './ThemeToggle';
import styles from './SiteHeader.module.css';

const NAV_LINKS = [
  { href: '/terms', label: 'Terms' },
  { href: '/acronyms', label: 'Acronyms' },
  { href: '/tags', label: 'Tags' },
  { href: '/sources', label: 'Sources' },
  { href: '/about', label: 'About' },
] as const;

export function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link className={styles.brand} href="/">
          SynAc
        </Link>

        <nav className={styles.nav} aria-label="Primary">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} className={styles.navLink} href={l.href}>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className={styles.actions}>
          <SearchPalette />
          <ThemeToggle />
          <MobileNav links={[...NAV_LINKS]} />
        </div>
      </div>
    </header>
  );
}
