'use client';

import { useEffect, useRef, useState } from 'react';

import type { SenseNavItem } from '@/lib/publicEntryPage';

import styles from './SenseNav.module.css';

type SenseNavProps = {
  items: SenseNavItem[];
  /** The rail shows from 1280px up; the chip row replaces it below that. */
  variant: 'rail' | 'chips';
};

export function SenseNav({ items, variant }: SenseNavProps) {
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (items.length <= 1) return;

    const elements = items.flatMap((item) => {
      const element = document.getElementById(item.id);
      return element ? [element] : [];
    });

    if (elements.length <= 1) return;

    function setFromHash() {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (items.some((item) => item.id === hash)) setActiveId(hash);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const top = visible[0];
        if (!top) return;
        const id = top.target.id;
        if (items.some((item) => item.id === id)) setActiveId(id);
      },
      {
        root: null,
        threshold: [0.2, 0.35, 0.5, 0.65, 0.8],
        rootMargin: '-30% 0px -60% 0px',
      },
    );

    for (const element of elements) observer.observe(element);
    window.addEventListener('hashchange', setFromHash);
    setFromHash();

    return () => {
      observer.disconnect();
      window.removeEventListener('hashchange', setFromHash);
    };
  }, [items]);

  useEffect(() => {
    if (variant !== 'chips' || !activeId) return;
    const list = listRef.current;
    if (!list || list.scrollWidth <= list.clientWidth) return;
    const chip = list.querySelector<HTMLElement>(
      `[data-sense-id="${CSS.escape(activeId)}"]`,
    );
    if (!chip) return;
    // Horizontal only: scrollIntoView would drag the page vertically as well.
    list.scrollLeft =
      chip.offsetLeft - (list.clientWidth - chip.offsetWidth) / 2;
  }, [activeId, variant]);

  if (items.length < 2) return null;

  const isChips = variant === 'chips';

  return (
    <nav
      className={isChips ? styles.chips : styles.rail}
      aria-label={isChips ? 'Senses' : 'On this page'}
    >
      {isChips ? null : <div className={styles.railTitle}>On this page</div>}
      <ul className={isChips ? styles.chipList : styles.railList} ref={listRef}>
        {items.map((item) => {
          const active = activeId === item.id;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                data-sense-id={item.id}
                aria-current={active ? 'true' : undefined}
                className={
                  isChips
                    ? `${styles.chip} ${active ? styles.chipActive : ''}`
                    : `${styles.railLink} ${active ? styles.railLinkActive : ''}`
                }
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
