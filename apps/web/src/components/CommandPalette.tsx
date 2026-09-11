'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';

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
  {
    id: 'nav-acronyms',
    label: 'Browse acronyms',
    href: '/acronyms',
    hint: '/acronyms',
  },
  { id: 'nav-tags', label: 'Browse tags', href: '/tags', hint: '/tags' },
  {
    id: 'nav-sources',
    label: 'Browse sources',
    href: '/sources',
    hint: '/sources',
  },
  {
    id: 'nav-recent',
    label: 'Recent updates',
    href: '/recent',
    hint: '/recent',
  },
  { id: 'nav-about', label: 'About', href: '/about', hint: '/about' },
  {
    id: 'nav-changelog',
    label: 'Changelog',
    href: '/changelog',
    hint: '/changelog',
  },
];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  return target.isContentEditable;
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

  for (const token of tokens) {
    if (haystack === token) score += 8;
    else if (haystack.startsWith(token)) score += 6;
    else if (haystack.includes(token)) score += 3;
  }

  if (command.label.toLowerCase().startsWith(tokens[0] ?? '')) score += 2;
  return score;
}

export function CommandPalette() {
  const router = useRouter();
  const baseId = useId();
  const listId = `command-palette-list-${baseId}`;
  const optionId = (index: number) => `${listId}-opt-${index}`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  /**
   * A free-text query always yields at least the "Search for …" item and an
   * empty query always yields the full command list, so the list is never
   * empty, so there is no empty state to render.
   */
  const items = useMemo(() => {
    const q = normalizeQuery(query);
    if (!q.length) return BASE_COMMANDS;

    const searchItem: CommandItem = {
      id: 'search',
      label: `Search for “${q}”`,
      href: `/search?q=${encodeURIComponent(q)}`,
      hint: '/search',
      keywords: ['search'],
    };

    const filtered = BASE_COMMANDS.map((command) => ({
      command,
      score: scoreCommand(q, command),
    }))
      .filter((row) => row.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score || a.command.label.localeCompare(b.command.label),
      )
      .map((row) => row.command);

    return [searchItem, ...filtered];
  }, [query]);

  const close = useCallback((options?: { restoreFocus?: boolean }) => {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
    if (options?.restoreFocus !== false) triggerRef.current?.focus();
  }, []);

  const openPalette = useCallback(() => {
    setQuery('');
    setActiveIndex(0);
    setOpen(true);
  }, []);

  // Global shortcuts only. Everything else is handled on the dialog itself.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();

      if ((event.metaKey || event.ctrlKey) && key === 'k') {
        event.preventDefault();
        if (open) close();
        else openPalette();
        return;
      }

      if (
        !open &&
        key === '/' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        if (isEditableTarget(event.target)) return;
        const input = document.getElementById('site-search');
        if (!(input instanceof HTMLInputElement)) return;
        event.preventDefault();
        input.focus();
        input.select();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close, open, openPalette]);

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

  function commit(index: number) {
    const item = items[index];
    if (!item) return;
    close({ restoreFocus: false });
    router.push(item.href);
  }

  /** Keeps Tab inside the dialog while it is modal. */
  function trapFocus(event: React.KeyboardEvent<HTMLDivElement>) {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(FOCUSABLE),
    ).filter(
      (element) =>
        element.offsetParent !== null || element === document.activeElement,
    );

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function onDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const key = event.key.toLowerCase();

    if (key === 'tab') {
      trapFocus(event);
      return;
    }

    if (key === 'escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }

    if (key === 'arrowdown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(items.length - 1, index + 1));
      return;
    }

    if (key === 'arrowup') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
      return;
    }

    if (key === 'home') {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (key === 'end') {
      event.preventDefault();
      setActiveIndex(items.length - 1);
      return;
    }

    if (key === 'enter') {
      event.preventDefault();
      commit(activeIndex);
    }
  }

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className={styles.trigger}
        onClick={openPalette}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Commands
        <span className={styles.triggerKbd} aria-hidden="true">
          ⌘K
        </span>
      </button>

      {open
        ? createPortal(
            <div className={styles.overlay} onMouseDown={() => close()}>
              <div
                ref={dialogRef}
                className={styles.dialog}
                role="dialog"
                aria-modal="true"
                aria-label="Command palette"
                onMouseDown={(event) => event.stopPropagation()}
                onKeyDown={onDialogKeyDown}
              >
                <div className={styles.top}>
                  <input
                    ref={inputRef}
                    className={styles.input}
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setActiveIndex(0);
                    }}
                    placeholder="Type to navigate…"
                    aria-label="Command query"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded
                    aria-controls={listId}
                    aria-activedescendant={optionId(activeIndex)}
                  />
                  <div className={styles.meta} aria-hidden="true">
                    Esc
                  </div>
                </div>

                <ul
                  className={styles.list}
                  role="listbox"
                  id={listId}
                  aria-label="Commands"
                >
                  {items.map((item, index) => (
                    <li
                      key={item.id}
                      id={optionId(index)}
                      role="option"
                      aria-selected={index === activeIndex}
                      className={`${styles.item} ${index === activeIndex ? styles.itemActive : ''}`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => commit(index)}
                    >
                      <span className={styles.label}>{item.label}</span>
                      {item.hint ? (
                        <span className={styles.hint}>{item.hint}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
