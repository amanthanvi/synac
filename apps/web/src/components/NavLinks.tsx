'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import styles from './SiteHeader.module.css';

export type NavLinkItem = {
  href: string;
  label: string;
};

function isCurrent(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  // Detail routes belong to their index section (e.g. /term/* → /terms).
  if (href === '/terms' && pathname.startsWith('/term/')) return true;
  if (href === '/acronyms' && pathname.startsWith('/acronym/')) return true;
  return pathname.startsWith(`${href}/`);
}

export function NavLinks({ links }: { links: NavLinkItem[] }) {
  const pathname = usePathname() ?? '';

  return (
    <>
      {links.map((l) => {
        const current = isCurrent(pathname, l.href);
        return (
          <Link
            key={l.href}
            className={current ? `${styles.navLink} ${styles.navLinkCurrent}` : styles.navLink}
            aria-current={current ? 'page' : undefined}
            href={l.href}
          >
            {l.label}
          </Link>
        );
      })}
    </>
  );
}
