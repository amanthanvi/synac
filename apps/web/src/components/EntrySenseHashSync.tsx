'use client';

import { useEffect } from 'react';

type EntrySenseHashSyncProps = {
  collapseOthers?: boolean;
};

function openSenseFromHash(collapseOthers: boolean) {
  const hash = window.location.hash;
  if (!hash.startsWith('#sense-')) return;

  const rawId = hash.slice(1);
  const target = document.getElementById(rawId);
  if (!target) return;

  const details =
    target instanceof HTMLDetailsElement ? target : target.closest('details[data-sense]');
  if (!(details instanceof HTMLDetailsElement)) return;

  if (collapseOthers) {
    const root = details.closest('[data-senses]') ?? document;
    const all = root.querySelectorAll('details[data-sense]');
    for (const el of Array.from(all)) {
      if (el !== details) el.removeAttribute('open');
    }
  }

  details.setAttribute('open', '');
}

export function EntrySenseHashSync({ collapseOthers = false }: EntrySenseHashSyncProps) {
  useEffect(() => {
    const handler = () => openSenseFromHash(collapseOthers);
    handler();
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, [collapseOthers]);

  return null;
}

