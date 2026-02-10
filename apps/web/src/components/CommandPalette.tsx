'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import styles from './CommandPalette.module.css';

type CommandItem = {
  id: string;
  label: string;
  href: string;
  hint?: string;
  keywords?: string[];
};

const BASE_COMMANDS: CommandItem[] = [
  { id: 'nav-terms', label: 'Browse terms', href: '/terms', hint: '/terms' },
  { id: 'nav-acronyms', label: 'Browse acronyms', href: '/acronyms', hint: '/acronyms' },
  { id: 'nav-tags', label: 'Browse tags', href: '/tags', hint: '/tags' },
  { id: 'nav-sources', label: 'Browse sources', href: '/sources', hint: '/sources' },
  { id: 'nav-recent', label: 'Recent updates', href: '/recent', hint: '/recent' },
  { id: 'nav-about', label: 'About', href: '/about', hint: '/about' },
  { id: 'nav-changelog', label: 'Changelog', href: '/changelog', hint: '/changelog' },
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

function scoreCommand(query: string, command: CommandItem): number {
  const haystack = [
    command.label,
    command.href,
    ...(command.keywords ?? []),
    ...(command.hint ? [command.hint] : []),
  ]
    .join(' ')
    .toLowerCase();

  const tokens = query.split(' ').filter(Boolean);
  let score = 0;

  for (const t of tokens) {
    if (haystack === t) score += 8;
    else if (haystack.startsWith(t)) score += 6;
    else if (haystack.includes(t)) score += 3;
  }

  if (command.label.toLowerCase().startsWith(tokens[0] ?? '')) score += 2;
  return score;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => {
    const q = normalizeQuery(query);
    const list: CommandItem[] = [...BASE_COMMANDS];

    if (q.length) {
      const searchItem: CommandItem = {
        id: 'search',
        label: `Search for “${q}”`,
        href: `/search?q=${encodeURIComponent(q)}`,
        hint: '/search',
        keywords: ['search'],
      };

      const filtered = list
        .map((c) => ({ c, score: scoreCommand(q, c) }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score || a.c.label.localeCompare(b.c.label))
        .map((r) => r.c);

      return [searchItem, ...filtered];
    }

    return list;
  }, [query]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const key = e.key.toLowerCase();

      if ((e.metaKey || e.ctrlKey) && key === 'k') {
        e.preventDefault();
        if (open) {
          setOpen(false);
          setQuery('');
          setActiveIndex(0);
        } else {
          setQuery('');
          setActiveIndex(0);
          setOpen(true);
        }
        return;
      }

      if (!open && key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (isEditableTarget(e.target)) return;
        const input = document.getElementById('site-search') as HTMLInputElement | null;
        if (!input) return;
        e.preventDefault();
        input.focus();
        input.select();
        return;
      }

      if (!open) return;

      if (key === 'escape') {
        e.preventDefault();
        setOpen(false);
        setQuery('');
        setActiveIndex(0);
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
        setOpen(false);
        setQuery('');
        setActiveIndex(0);
        router.push(item.href);
        return;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, items, open, router]);

  useEffect(() => {
    if (!open) return;
    const handle = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(handle);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => {
          setQuery('');
          setActiveIndex(0);
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Commands
        <span className={styles.triggerKbd} aria-hidden="true">
          ⌘K
        </span>
      </button>

      {open ? (
        <div
          className={styles.overlay}
          onMouseDown={() => {
            setOpen(false);
            setQuery('');
            setActiveIndex(0);
          }}
        >
          <div
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className={styles.top}>
              <input
                ref={inputRef}
                className={styles.input}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                placeholder="Type to navigate…"
                aria-label="Command query"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <div className={styles.meta} aria-hidden="true">
                Esc
              </div>
            </div>

            <ul className={styles.list} role="listbox" aria-label="Commands">
              {items.map((item, idx) => (
                <li
                  key={item.id}
                  role="option"
                  aria-selected={idx === activeIndex}
                  className={`${styles.item} ${idx === activeIndex ? styles.itemActive : ''}`}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => {
                    setOpen(false);
                    setQuery('');
                    setActiveIndex(0);
                    router.push(item.href);
                  }}
                >
                  <span className={styles.label}>{item.label}</span>
                  {item.hint ? <span className={styles.hint}>{item.hint}</span> : null}
                </li>
              ))}
            </ul>

            {items.length === 0 ? (
              <div className={styles.empty}>No matches. Try a different query.</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
