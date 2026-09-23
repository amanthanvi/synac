'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';

import { renderHeadline } from '@/lib/highlight';
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
  senseSummary: string | null;
};

type PaletteItem =
  | { kind: 'search'; id: string; label: string; href: string }
  | { kind: 'entry'; id: string; href: string; entry: EntryResult }
  | { kind: 'nav'; id: string; label: string; href: string };

/** 'busy' is the rate limiter refusing, not an empty result set. */
type SearchStatus = 'idle' | 'loading' | 'ready' | 'busy' | 'error';

const NAV_ITEMS: NavItem[] = [
  { id: 'nav-terms', label: 'Browse terms', href: '/terms' },
  { id: 'nav-acronyms', label: 'Browse acronyms', href: '/acronyms' },
  { id: 'nav-tags', label: 'Browse tags', href: '/tags' },
  { id: 'nav-sources', label: 'Browse sources', href: '/sources' },
  { id: 'nav-recent', label: 'Recent updates', href: '/recent' },
  { id: 'nav-about', label: 'About', href: '/about' },
  { id: 'nav-changelog', label: 'Changelog', href: '/changelog' },
];

/** Page furniture behind the dialog; both live outside React's tree. */
const INERT_SELECTORS = ['#content', '#site-header'];

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
  const haystack = [item.label, item.href, ...(item.keywords ?? [])]
    .join(' ')
    .toLowerCase();
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
  const [status, setStatus] = useState<SearchStatus>('idle');
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const q = normalizeQuery(query);

  useEffect(() => {
    if (!open || q.length < 2) return;

    // updateQuery already set status to 'loading' for this query.
    const controller = new AbortController();
    const handle = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/v1/search?q=${encodeURIComponent(q)}`,
          {
            signal: controller.signal,
          },
        );
        if (response.status === 429) {
          setEntries([]);
          setActiveIndex(0);
          setStatus('busy');
          return;
        }
        if (!response.ok) throw new Error(`search ${response.status}`);
        const body = (await response.json()) as { results?: EntryResult[] };
        setEntries((body.results ?? []).slice(0, 8));
        setActiveIndex(0);
        setStatus('ready');
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setEntries([]);
          setActiveIndex(0);
          setStatus('error');
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
      return NAV_ITEMS.map((item) => ({
        kind: 'nav',
        id: item.id,
        label: item.label,
        href: item.href,
      }));
    }

    const list: PaletteItem[] = [
      {
        kind: 'search',
        id: 'search-all',
        label: `Search for “${q}”`,
        href: `/search?q=${encodeURIComponent(q)}`,
      },
      ...entries.map((entry): PaletteItem => ({
        kind: 'entry',
        id: `entry-${entry.id}`,
        href: entryHref(entry),
        entry,
      })),
      ...NAV_ITEMS.filter((item) => matchesNav(q, item)).map(
        (item): PaletteItem => ({
          kind: 'nav',
          id: item.id,
          label: item.label,
          href: item.href,
        }),
      ),
    ];
    return list;
  }, [q, entries]);

  function close() {
    setOpen(false);
    setQuery('');
    setEntries([]);
    setStatus('idle');
    setActiveIndex(0);
  }

  function openPalette() {
    setQuery('');
    setEntries([]);
    setStatus('idle');
    setActiveIndex(0);
    setOpen(true);
  }

  function updateQuery(value: string) {
    const nextQuery = normalizeQuery(value);
    setQuery(value);
    if (nextQuery === q) return;
    setEntries([]);
    setStatus(nextQuery.length >= 2 ? 'loading' : 'idle');
    setActiveIndex(0);
  }

  function navigate(href: string) {
    close();
    router.push(href);
  }

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

      // Tab is deliberately not intercepted: the sentinels around the dialog
      // keep focus inside, and Shift+Tab stays a real Tab for the browser.

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

  // Focus, scroll lock, the inert screen behind the dialog, and focus restore
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

    const handle = window.setTimeout(() => inputRef.current?.focus(), 0);

    return () => {
      window.clearTimeout(handle);
      document.body.style.overflow = previousOverflow;
      for (const node of blocked) node.removeAttribute('inert');
      restoreTo?.focus();
    };
  }, [open]);

  const activeItem = items[activeIndex];
  const resultCount = entries.length;
  const announcement = !q
    ? ''
    : status === 'busy'
      ? 'Search is busy, try again'
      : status === 'error'
        ? 'Search is unavailable'
        : status !== 'ready'
          ? ''
          : resultCount === 0
            ? 'No results'
            : `${resultCount} ${resultCount === 1 ? 'result' : 'results'}`;

  function focusInput() {
    inputRef.current?.focus();
  }

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
        <svg
          className={styles.triggerIcon}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="11"
            cy="11"
            r="6.5"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="m16 16 4.5 4.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
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
                className={styles.sentinel}
                tabIndex={0}
                onFocus={focusInput}
              />
              <div
                className={styles.dialog}
                role="dialog"
                aria-modal="true"
                aria-label="Search"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className={styles.top}>
                  <svg
                    className={styles.inputIcon}
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle
                      cx="11"
                      cy="11"
                      r="6.5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                    <path
                      d="m16 16 4.5 4.5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                  <input
                    ref={inputRef}
                    className={styles.input}
                    value={query}
                    onChange={(e) => updateQuery(e.target.value)}
                    placeholder="Search terms and acronyms…"
                    aria-label="Search terms and acronyms"
                    role="combobox"
                    aria-expanded="true"
                    aria-controls={listboxId}
                    aria-autocomplete="list"
                    aria-activedescendant={
                      activeItem ? `${listboxId}-${activeItem.id}` : undefined
                    }
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  {status === 'loading' ? (
                    <span className={styles.searching} aria-hidden="true" />
                  ) : (
                    <kbd className={styles.escHint} aria-hidden="true">
                      esc
                    </kbd>
                  )}
                </div>

                <ul
                  className={styles.list}
                  id={listboxId}
                  role="listbox"
                  aria-label="Results"
                >
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
                            <span className={styles.entryTitle}>
                              {item.entry.displayTitle}
                            </span>
                            <TypeMarker type={item.entry.entryType} />
                          </span>
                          {/* Same precedence as /search: the highlighted
                              snippet explains the match, and senseSummary (a
                              list of sense labels) only fills a gap. */}
                          {item.entry.snippet ? (
                            <span className={styles.entrySummary}>
                              {renderHeadline(item.entry.snippet)}
                            </span>
                          ) : item.entry.senseSummary ? (
                            <span className={styles.entrySummary}>
                              {item.entry.senseSummary}
                            </span>
                          ) : item.entry.summaryText ? (
                            <span className={styles.entrySummary}>
                              {item.entry.summaryText}
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

                {q && status === 'busy' ? (
                  <div className={styles.empty}>
                    Search is busy, try again. Press Enter for full-text search.
                  </div>
                ) : q && status === 'error' ? (
                  <div className={styles.empty}>
                    Search is unavailable right now. Press Enter for full-text
                    search.
                  </div>
                ) : q && status === 'ready' && entries.length === 0 ? (
                  <div className={styles.empty}>
                    No entries match “{q}” yet. Press Enter for full-text
                    search.
                  </div>
                ) : null}

                <p className="srOnly" role="status" aria-live="polite">
                  {announcement}
                </p>
              </div>
              <div
                className={styles.sentinel}
                tabIndex={0}
                onFocus={focusInput}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
