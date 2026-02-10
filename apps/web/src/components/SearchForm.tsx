'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import styles from './SearchForm.module.css';

type SearchFormProps = {
  action?: string;
  defaultValue?: string;
  placeholder?: string;
  inputName?: string;
  inputId?: string;
};

type SearchResult = {
  id: string;
  entryType: 'TERM' | 'ACRONYM';
  displayTitle: string;
  summaryText?: string | null;
  url: string;
};

function buildSearchHref(action: string, inputName: string, query: string): string {
  const base = new URL(action, 'http://synac.local');
  base.searchParams.set(inputName, query);
  return `${base.pathname}${base.search}`;
}

export function SearchForm({
  action = '/search',
  defaultValue,
  placeholder = 'Search terms and acronyms…',
  inputName = 'q',
  inputId,
}: SearchFormProps) {
  const router = useRouter();
  const autoId = useId();
  const resolvedInputId = inputId ?? `search-${autoId}`;
  const resolvedListId = `${resolvedInputId}-suggestions`;

  const [value, setValue] = useState(defaultValue ?? '');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [activeIndex, setActiveIndex] = useState(-1);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);

  const trimmed = value.trim();

  const seeAllHref = useMemo(() => {
    if (!trimmed) return null;
    return buildSearchHref(action, inputName, trimmed);
  }, [action, inputName, trimmed]);

  const optionCount = results.length + (seeAllHref ? 1 : 0);
  const activeDescendantId =
    open && activeIndex >= 0 ? `${resolvedListId}-opt-${activeIndex}` : undefined;

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const wrap = wrapRef.current;
      if (!wrap) return;
      if (wrap.contains(e.target as Node)) return;
      setOpen(false);
      setActiveIndex(-1);
    }

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, []);

  function cancelPending() {
    abortRef.current?.abort();
    abortRef.current = null;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = null;
  }

  async function runSearch(query: string) {
    cancelPending();

    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;

    try {
      const res = await fetch(`/api/v1/search?q=${encodeURIComponent(query)}&page=1`, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });

      if (!res.ok) throw new Error(`search_failed_${res.status}`);

      const data = (await res.json()) as { results?: SearchResult[] };
      if (controller.signal.aborted) return;
      if (requestIdRef.current !== requestId) return;

      const next = (data.results ?? []).slice(0, 7).map((r) => ({
        id: r.id,
        entryType: r.entryType,
        displayTitle: r.displayTitle,
        summaryText: r.summaryText,
        url: r.url,
      }));

      setResults(next);
      setStatus('idle');
    } catch {
      if (controller.signal.aborted) return;
      if (requestIdRef.current !== requestId) return;

      setResults([]);
      setStatus('error');
    }
  }

  function commitSelection(index: number) {
    if (index < 0) return;

    if (index < results.length) {
      setOpen(false);
      setActiveIndex(-1);
      router.push(results[index]?.url ?? '/');
      return;
    }

    if (seeAllHref) {
      setOpen(false);
      setActiveIndex(-1);
      router.push(seeAllHref);
    }
  }

  return (
    <form
      className={styles.form}
      action={action}
      method="get"
      role="search"
      onSubmit={() => {
        setOpen(false);
        setActiveIndex(-1);
      }}
    >
      <div className={styles.wrap} ref={wrapRef}>
        <div className={styles.field}>
        <label className="srOnly" htmlFor={resolvedInputId}>
          Search
        </label>
        <svg
          className={styles.icon}
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path
            fill="currentColor"
            d="M10 4a6 6 0 1 1 0 12A6 6 0 0 1 10 4m0-2a8 8 0 1 0 4.9 14.3l4.4 4.4a1 1 0 0 0 1.4-1.4l-4.4-4.4A8 8 0 0 0 10 2"
          />
        </svg>
        <input
          ref={inputRef}
          className={styles.input}
          id={resolvedInputId}
          name={inputName}
          value={value}
          onChange={(e) => {
            const nextValue = e.target.value;
            setValue(nextValue);
            setActiveIndex(-1);

            const nextTrimmed = nextValue.trim();
            if (nextTrimmed.length < 2) {
              cancelPending();
              setResults([]);
              setStatus('idle');
              setOpen(false);
              return;
            }

            setOpen(true);
            setStatus('loading');
            setResults([]);
            debounceRef.current = window.setTimeout(() => {
              void runSearch(nextTrimmed);
            }, 220);
          }}
          onKeyDown={(e) => {
            const hasOptions = optionCount > 0;

            if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && hasOptions) {
              e.preventDefault();
              setOpen(true);
              setActiveIndex(0);
              return;
            }

            if (!open) return;

            if (e.key === 'Escape') {
              e.preventDefault();
              setOpen(false);
              setActiveIndex(-1);
              return;
            }

            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIndex((i) => Math.min(optionCount - 1, i + 1));
              return;
            }

            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIndex((i) => Math.max(-1, i - 1));
              return;
            }

            if (e.key === 'Enter' && activeIndex >= 0) {
              e.preventDefault();
              commitSelection(activeIndex);
            }
          }}
          onFocus={() => {
            if (trimmed.length >= 2) setOpen(true);
          }}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck="false"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={resolvedListId}
          aria-activedescendant={activeDescendantId}
        />
        </div>

        {open ? (
          <div className={styles.popover}>
            {status === 'loading' ? (
              <div className={styles.status}>Searching…</div>
            ) : status === 'error' ? (
              <div className={styles.status}>Search unavailable. Press Enter to search.</div>
            ) : results.length === 0 && trimmed.length >= 2 ? (
              <div className={styles.status}>No matches. Press Enter to search.</div>
            ) : null}

            <ul
              className={styles.list}
              role="listbox"
              id={resolvedListId}
              aria-label="Search suggestions"
            >
              {results.map((r, idx) => (
                <li
                  key={r.id}
                  id={`${resolvedListId}-opt-${idx}`}
                  role="option"
                  aria-selected={idx === activeIndex}
                  className={`${styles.option} ${idx === activeIndex ? styles.optionActive : ''}`}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commitSelection(idx);
                  }}
                >
                  <span
                    className={`${styles.badge} ${
                      r.entryType === 'ACRONYM' ? styles.badgeAcronym : styles.badgeTerm
                    }`}
                  >
                    {r.entryType}
                  </span>
                  <span className={styles.optionBody}>
                    <span className={styles.optionTitle}>{r.displayTitle}</span>
                    {r.summaryText ? (
                      <span className={styles.optionSummary}>{r.summaryText}</span>
                    ) : null}
                  </span>
                </li>
              ))}

              {seeAllHref ? (
                <li
                  id={`${resolvedListId}-opt-${results.length}`}
                  role="option"
                  aria-selected={results.length === activeIndex}
                  className={`${styles.option} ${results.length === activeIndex ? styles.optionActive : ''}`}
                  onMouseEnter={() => setActiveIndex(results.length)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commitSelection(results.length);
                  }}
                >
                  <span className={styles.badge}>↵</span>
                  <span className={styles.optionBody}>
                    <span className={styles.optionTitle}>Search for “{trimmed}”</span>
                    <span className={styles.optionSummary}>See all results</span>
                  </span>
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </div>
    </form>
  );
}
