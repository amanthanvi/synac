'use client';

import Link from 'next/link';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import styles from './MobileNav.module.css';

type MobileNavLink = {
  href: string;
  label: string;
};

export function MobileNav({ links }: { links: MobileNavLink[] }) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const dialogId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function onPanelKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return;

    const panel = panelRef.current;
    if (!panel) return;

    const focusable = panel.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
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
        className={styles.trigger}
        type="button"
        aria-label="Open menu"
        aria-controls={dialogId}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <svg className={styles.icon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M5 7h14M5 12h14M5 17h14"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open && mounted
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
                  {links.map((l) => (
                    <Link
                      key={l.href}
                      className={styles.link}
                      href={l.href}
                      onClick={() => setOpen(false)}
                    >
                      {l.label}
                    </Link>
                  ))}
                </nav>

                <div className={styles.hint}>
                  Tip: press <strong>/</strong> to search · <strong>⌘K</strong> for commands.
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
