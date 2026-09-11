'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

import styles from './StickySenseToc.module.css';

type SenseTocItem = {
  /** Sense uuid; the card is rendered with id `sense-<id>`. */
  id: string;
  /** `#s-<slug>` when the sense has a slug, else `#sense-<uuid>`. */
  fragment: string;
  label: string;
};

function idFromHash(hash: string, items: SenseTocItem[]): string | null {
  if (!hash) return null;
  const match = items.find((item) => item.fragment === hash);
  if (match) return match.id;
  if (hash.startsWith('#sense-')) {
    const raw = hash.slice('#sense-'.length);
    return items.some((item) => item.id === raw) ? raw : null;
  }
  return null;
}

function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

function getHashSnapshot(): string {
  return window.location.hash;
}

function getServerHashSnapshot(): string {
  return '';
}

/**
 * Which sense is currently in view.
 *
 * The fragment is read through `useSyncExternalStore`, never seeded into
 * `useState` during render: that mismatch between the server (no hash) and the
 * client (hash present) was the hydration bug. Scroll position wins once the
 * observer has reported, so following a deep link and then scrolling both work.
 */
function useActiveSenseId(items: SenseTocItem[]): string | null {
  const hash = useSyncExternalStore(
    subscribeToHash,
    getHashSnapshot,
    getServerHashSnapshot,
  );
  const [scrolledId, setScrolledId] = useState<string | null>(null);

  useEffect(() => {
    if (items.length <= 1) return;

    const elements = items
      .map((item) => document.getElementById(`sense-${item.id}`))
      .filter((element): element is HTMLElement => Boolean(element));

    if (elements.length <= 1) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const top = visible[0];
        if (!top) return;
        const id = top.target.id.replace('sense-', '');
        if (items.some((item) => item.id === id)) setScrolledId(id);
      },
      {
        root: null,
        threshold: [0.2, 0.35, 0.5, 0.65, 0.8],
        rootMargin: '-30% 0px -60% 0px',
      },
    );

    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, [items]);

  return scrolledId ?? idFromHash(hash, items) ?? items[0]?.id ?? null;
}

/** Desktop rail. Hidden under 920px, where `SenseTocChips` takes over. */
export function StickySenseToc({ items }: { items: SenseTocItem[] }) {
  const activeId = useActiveSenseId(items);

  if (items.length <= 1) return null;

  return (
    <nav className={styles.toc} aria-label="On this page">
      <h2 className={styles.title}>On this page</h2>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={item.fragment}
              className={`${styles.link} ${activeId === item.id ? styles.active : ''}`}
              aria-current={activeId === item.id ? 'location' : undefined}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Small-screen counterpart: one horizontally scrollable row of the same items. */
export function SenseTocChips({ items }: { items: SenseTocItem[] }) {
  const activeId = useActiveSenseId(items);

  if (items.length <= 1) return null;

  return (
    <nav className={styles.chipNav} aria-label="Senses on this page">
      <ul className={styles.chipList}>
        {items.map((item) => (
          <li key={item.id} className={styles.chipItem}>
            <a
              href={item.fragment}
              className={`${styles.chip} ${activeId === item.id ? styles.chipActive : ''}`}
              aria-current={activeId === item.id ? 'location' : undefined}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
