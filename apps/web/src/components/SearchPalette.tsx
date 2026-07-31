'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';

import { TypeMarker } from './ui/TypeMarker';
import styles from './SearchPalette.module.css';

type NavItem = {
  id: string;
  label: string;
  href: string;
  keywords?: string[];
};

type EntryResult = {
  id: string;
  entryType: 'TERM' | 'ACRONYM';
  displayTitle: string;
  primarySlug: string;
  summaryText: string | null;
  snippet: string | null;
};

type PaletteItem =
  | { kind: 'search'; id: string; label: string; href: string }
  | { kind: 'entry'; id: string; href: string; entry: EntryResult }
  | { kind: 'nav'; id: string; label: string; href: string };

const NAV_ITEMS: NavItem[] = [
  { id: 'nav-terms', label: 'Browse terms', href: '/terms' },
  { id: 'nav-acronyms', label: 'Browse acronyms', href: '/acronyms' },
  { id: 'nav-tags', label: 'Browse tags', href: '/tags' },
  { id: 'nav-sources', label: 'Browse sources', href: '/sources' },
  { id: 'nav-recent', label: 'Recent updates', href: '/recent' },
  { id: 'nav-about', label: 'About', href: '/about' },
  { id: 'nav-changelog', label: 'Changelog', href: '/changelog' },
];

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (!tag) return false;
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (el.isContentEditable) return true;
  return false;
}

function normalizeQuery(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function matchesNav(query: string, item: NavItem): boolean {
  const haystack = [item.label, item.href, ...(item.keywords ?? [])].join(' ').toLowerCase();
  return query.split(' ').every((token) => !token || haystack.includes(token));
}

function entryHref(entry: EntryResult): string {
  return entry.entryType === 'TERM'
    ? `/term/${entry.primarySlug}`
    : `/acronym/${entry.primarySlug}`;
}

export function SearchPalette() {
  const router = useRouter();
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [entries, setEntries] = useState<EntryResult[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const q = normalizeQuery(query);

  useEffect(() => {
    if (!open || q.length < 2) {
      setEntries([]);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    setSearching(true);
    const handle = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/v1/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`search ${response.status}`);
        const body = (await response.json()) as { results?: EntryResult[] };
        setEntries((body.results ?? []).slice(0, 8));
        setSearching(false);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setEntries([]);
          setSearching(false);
        }
      }
    }, 150);

    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [open, q]);

  const items = useMemo<PaletteItem[]>(() => {
    if (!q) {
      return NAV_ITEMS.map((item) => ({ kind: 'nav', id: item.id, label: item.label, href: item.href }));
    }

    const list: PaletteItem[] = [
      {
        kind: 'search',
        id: 'search-all',
        label: `Search for “${q}”`,
        href: `/search?q=${encodeURIComponent(q)}`,
      },
      ...entries.map(
        (entry): PaletteItem => ({ kind: 'entry', id: `entry-${entry.id}`, href: entryHref(entry), entry }),
      ),
      ...NAV_ITEMS.filter((item) => matchesNav(q, item)).map(
        (item): PaletteItem => ({ kind: 'nav', id: item.id, label: item.label, href: item.href }),
      ),
    ];
    return list;
  }, [q, entries]);

  function close() {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
    triggerRef.current?.focus();
  }

  function openPalette() {
    setQuery('');
    setEntries([]);
    setActiveIndex(0);
    setOpen(true);
  }

  function navigate(href: string) {
    close();
    router.push(href);
  }

  useEffect(() => {
    setActiveIndex(0);
  }, [q]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const key = e.key.toLowerCase();

      if ((e.metaKey || e.ctrlKey) && key === 'k') {
        e.preventDefault();
        if (open) close();
        else openPalette();
        return;
      }

      if (!open && key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (isEditableTarget(e.target)) return;
        e.preventDefault();
        openPalette();
        return;
      }

      if (!open) return;

      // The input is the dialog's only focusable element; keep focus inside.
      if (key === 'tab') {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }

      if (key === 'escape') {
        e.preventDefault();
        close();
        return;
      }

      if (key === 'arrowdown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(items.length - 1, i + 1));
        return;
      }

      if (key === 'arrowup') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
        return;
      }

      if (key === 'enter') {
        e.preventDefault();
        const item = items[activeIndex];
        if (!item) return;
        navigate(item.href);
        return;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, items, open]);

  useEffect(() => {
    if (!open) return;
    const handle = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(handle);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const activeItem = items[activeIndex];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        onClick={openPalette}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Search"
      >
        <svg className={styles.triggerIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.6" />
          <path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <span className={styles.triggerLabel}>Search…</span>
        <kbd className={styles.triggerKbd} aria-hidden="true">
          ⌘K
        </kbd>
      </button>

      {open
        ? createPortal(
            <div className={styles.overlay} onMouseDown={close}>
              <div
                className={styles.dialog}
                role="dialog"
                aria-modal="true"
                aria-label="Search"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className={styles.top}>
                  <svg className={styles.inputIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.6" />
                    <path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                  <input
                    ref={inputRef}
                    className={styles.input}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search terms and acronyms…"
                    aria-label="Search terms and acronyms"
                    role="combobox"
                    aria-expanded="true"
                    aria-controls={listboxId}
                    aria-activedescendant={activeItem ? `${listboxId}-${activeItem.id}` : undefined}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  {searching ? (
                    <span className={styles.searching} aria-hidden="true" />
                  ) : (
                    <kbd className={styles.escHint} aria-hidden="true">
                      esc
                    </kbd>
                  )}
                </div>

                <ul className={styles.list} id={listboxId} role="listbox" aria-label="Results">
                  {!q ? <li className={styles.groupLabel}>Go to</li> : null}
                  {items.map((item, idx) => (
                    <li
                      key={item.id}
                      id={`${listboxId}-${item.id}`}
                      role="option"
                      aria-selected={idx === activeIndex}
                      className={`${styles.item} ${idx === activeIndex ? styles.itemActive : ''}`}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => navigate(item.href)}
                    >
                      {item.kind === 'entry' ? (
                        <span className={styles.entryItem}>
                          <span className={styles.entryTitleRow}>
                            <span className={styles.entryTitle}>{item.entry.displayTitle}</span>
                            <TypeMarker type={item.entry.entryType} />
                          </span>
                          {item.entry.snippet || item.entry.summaryText ? (
                            <span className={styles.entrySummary}>
                              {item.entry.snippet ?? item.entry.summaryText}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className={styles.plainItem}>
                          <span>{item.label}</span>
                          <span className={styles.itemHref}>{item.href}</span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>

                {q && !searching && entries.length === 0 ? (
                  <div className={styles.empty}>
                    No entries match “{q}” yet. Press Enter for full-text search.
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
