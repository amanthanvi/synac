'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { isCurrentNavPath } from '@/lib/nav';
import styles from './SiteHeader.module.css';

export type NavLinkItem = {
  href: string;
  label: string;
};

export function NavLinks({ links }: { links: NavLinkItem[] }) {
  const pathname = usePathname() ?? '';

  return (
    <>
      {links.map((l) => {
        const current = isCurrentNavPath(pathname, l.href);
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
