'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';

import type { BrowseSort } from '@/lib/convex';
import { buildBrowseHref, type BrowseBasePath } from '@/lib/publicBrowse';
import styles from './BrowseControls.module.css';

type BrowseTag = {
  name: string;
  slug: string;
};

export type BrowseControlsProps = {
  basePath: BrowseBasePath;
  letter: string;
  sort: BrowseSort;
  query: string;
  activeTagSlug?: string | null;
  tags: BrowseTag[];
};

export function BrowseControls({
  basePath,
  letter,
  sort,
  query,
  activeTagSlug,
  tags,
}: BrowseControlsProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const sortRef = useRef<HTMLSelectElement | null>(null);
  const debounceRef = useRef<number | null>(null);

  const normalizedQuery = query.trim();

  const tagHrefs = useMemo(() => {
    const items: Array<{ label: string; slug: string | null; href: string }> =
      [];

    items.push({
      label: 'All tags',
      slug: null,
      href: buildBrowseHref({
        basePath,
        letter,
        page: 1,
        sort,
        query,
        tagSlug: null,
      }),
    });

    for (const t of tags) {
      items.push({
        label: t.name,
        slug: t.slug,
        href: buildBrowseHref({
          basePath,
          letter,
          page: 1,
          sort,
          query,
          tagSlug: t.slug,
        }),
      });
    }

    return items;
  }, [basePath, letter, query, sort, tags]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, [activeTagSlug, basePath, letter, sort]);

  useEffect(() => {
    const input = inputRef.current;
    if (input && document.activeElement !== input) {
      input.value = query;
    }

    const select = sortRef.current;
    if (select && document.activeElement !== select) {
      select.value = sort;
    }
  }, [query, sort]);

  return (
    <section className={styles.wrap} aria-label="Browse controls">
      <div className={styles.topRow}>
        <div className={styles.searchWrap}>
          <label className="srOnly" htmlFor="browse-filter">
            Filter entries
          </label>
          <input
            ref={inputRef}
            id="browse-filter"
            className={styles.search}
            defaultValue={query}
            onChange={(e) => {
              const next = e.target.value;
              if (debounceRef.current) window.clearTimeout(debounceRef.current);

              debounceRef.current = window.setTimeout(() => {
                debounceRef.current = null;
                const trimmed = next.trim();
                if (trimmed === normalizedQuery) return;

                router.replace(
                  buildBrowseHref({
                    basePath,
                    letter,
                    page: 1,
                    sort,
                    query: trimmed,
                    tagSlug: activeTagSlug ?? null,
                  }),
                );
              }, 260);
            }}
            placeholder="Filter within this index…"
            autoComplete="off"
            spellCheck="false"
          />
        </div>

        <div className={styles.sortWrap}>
          <label className="srOnly" htmlFor="browse-sort">
            Sort
          </label>
          <select
            ref={sortRef}
            id="browse-sort"
            className={styles.sort}
            defaultValue={sort}
            onChange={(e) => {
              if (debounceRef.current) {
                window.clearTimeout(debounceRef.current);
                debounceRef.current = null;
              }
              const nextSort =
                e.target.value === 'updated' ? 'updated' : 'title';
              if (nextSort === sort) return;

              router.replace(
                buildBrowseHref({
                  basePath,
                  letter,
                  page: 1,
                  sort: nextSort,
                  query,
                  tagSlug: activeTagSlug ?? null,
                }),
              );
            }}
          >
            <option value="title">Title (A–Z)</option>
            <option value="updated">Recently updated</option>
          </select>
        </div>
      </div>

      <nav className={styles.tags} aria-label="Tag filter">
        {tagHrefs.map((t) => (
          <Link
            key={t.slug ?? 'all'}
            className={`${styles.tag} ${
              (t.slug ?? null) === (activeTagSlug ?? null)
                ? styles.tagActive
                : ''
            }`}
            href={t.href}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </section>
  );
}
