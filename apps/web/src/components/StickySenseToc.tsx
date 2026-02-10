'use client';

import { useEffect, useState } from 'react';

import styles from './StickySenseToc.module.css';

type SenseTocItem = {
  id: string;
  label: string;
};

function getInitialActiveId(items: SenseTocItem[]): string | null {
  if (typeof window === 'undefined') return items[0]?.id ?? null;
  const hash = window.location.hash;
  if (hash.startsWith('#sense-')) {
    const raw = hash.replace('#sense-', '');
    if (items.some((i) => i.id === raw)) return raw;
  }
  return items[0]?.id ?? null;
}

export function StickySenseToc({ items }: { items: SenseTocItem[] }) {
  const [activeId, setActiveId] = useState<string | null>(() => getInitialActiveId(items));

  useEffect(() => {
    if (items.length <= 1) return;

    const elements = items
      .map((i) => document.getElementById(`sense-${i.id}`))
      .filter((el): el is HTMLElement => Boolean(el));

    if (elements.length <= 1) return;

    function setFromHash() {
      const hash = window.location.hash;
      if (!hash.startsWith('#sense-')) return;
      const raw = hash.replace('#sense-', '');
      if (items.some((i) => i.id === raw)) setActiveId(raw);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (b.intersectionRatio ?? 0) - (a.intersectionRatio ?? 0));
        const top = visible[0];
        if (!top?.target) return;
        const id = top.target.id.replace('sense-', '');
        if (items.some((i) => i.id === id)) setActiveId(id);
      },
      {
        root: null,
        threshold: [0.2, 0.35, 0.5, 0.65, 0.8],
        rootMargin: '-30% 0px -60% 0px',
      }
    );

    for (const el of elements) observer.observe(el);
    window.addEventListener('hashchange', setFromHash);
    setFromHash();

    return () => {
      observer.disconnect();
      window.removeEventListener('hashchange', setFromHash);
    };
  }, [items]);

  if (items.length <= 1) return null;

  return (
    <nav className={styles.toc} aria-label="On this page">
      <div className={styles.title}>On this page</div>
      <ul className={styles.list}>
        {items.map((i) => (
          <li key={i.id}>
            <a
              href={`#sense-${i.id}`}
              className={`${styles.link} ${activeId === i.id ? styles.active : ''}`}
            >
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
