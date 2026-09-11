'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { isCurrentNavPath } from '@/lib/nav';
import styles from './MobileNav.module.css';

type MobileNavLink = {
  href: string;
  label: string;
};

/** Page furniture behind the panel; both live outside React's tree. */
const INERT_SELECTORS = ['#content', '#site-header'];

export function MobileNav({ links }: { links: MobileNavLink[] }) {
  const pathname = usePathname() ?? '';
  const [open, setOpen] = useState(false);
  const dialogId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Focus, scroll lock, the inert screen behind the panel, and focus restore
  // all share one lifetime; the cleanup lifts inert before it restores focus so
  // the trigger inside the header is focusable again.
  useEffect(() => {
    if (!open) return;

    const restoreTo = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const blocked = INERT_SELECTORS.flatMap((selector) => {
      const node = document.querySelector(selector);
      return node ? [node] : [];
    });
    for (const node of blocked) node.setAttribute('inert', '');

    closeRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      for (const node of blocked) node.removeAttribute('inert');
      restoreTo?.focus();
    };
  }, [open]);

  function onPanelKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return;

    const panel = panelRef.current;
    if (!panel) return;

    const focusable = panel.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    const active = document.activeElement as HTMLElement | null;

    if (e.shiftKey) {
      if (!active || active === first) {
        e.preventDefault();
        last.focus();
      }
      return;
    }

    if (active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        className={styles.trigger}
        type="button"
        aria-label="Open menu"
        aria-controls={dialogId}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <svg
          className={styles.icon}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M5 7h14M5 12h14M5 17h14"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open
        ? createPortal(
            <div
              className={styles.overlay}
              role="presentation"
              onClick={() => setOpen(false)}
            >
              <div
                id={dialogId}
                ref={panelRef}
                className={styles.panel}
                role="dialog"
                aria-modal="true"
                aria-label="Navigation"
                onKeyDown={onPanelKeyDown}
                onClick={(e) => e.stopPropagation()}
              >
                <div className={styles.panelHeader}>
                  <div className={styles.panelTitle}>Menu</div>
                  <button
                    ref={closeRef}
                    className={styles.close}
                    type="button"
                    aria-label="Close menu"
                    onClick={() => setOpen(false)}
                  >
                    <svg
                      className={styles.icon}
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M7 7l10 10M17 7 7 17"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>

                <nav className={styles.links} aria-label="Mobile">
                  {links.map((l) => {
                    const current = isCurrentNavPath(pathname, l.href);
                    return (
                      <Link
                        key={l.href}
                        className={
                          current
                            ? `${styles.link} ${styles.linkCurrent}`
                            : styles.link
                        }
                        aria-current={current ? 'page' : undefined}
                        href={l.href}
                        onClick={() => setOpen(false)}
                      >
                        {l.label}
                      </Link>
                    );
                  })}
                </nav>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
