'use client';

import { useEffect } from 'react';

import { SENSE_OPEN_EVENT, type SenseOpenDetail } from './SenseCard';

type EntrySenseHashSyncProps = {
  /** Fragment (`#s-slug` / `#sense-uuid`) to sense id. Both forms are accepted. */
  senseIdByFragment: Record<string, string>;
  collapseOthers?: boolean;
};

/**
 * Turns the URL fragment into a `synac:sense-open` event and scrolls the target
 * into view. It never touches the `open` attribute directly, because
 * `SenseCard` owns that state.
 */
export function EntrySenseHashSync({
  senseIdByFragment,
  collapseOthers = false,
}: EntrySenseHashSyncProps) {
  useEffect(() => {
    function sync() {
      const hash = window.location.hash;
      if (!hash) return;

      const senseId = senseIdByFragment[hash];
      if (!senseId) return;

      const detail: SenseOpenDetail = { senseId, collapseOthers };
      window.dispatchEvent(
        new CustomEvent<SenseOpenDetail>(SENSE_OPEN_EVENT, { detail }),
      );

      // Let React commit the `open` state before measuring scroll position.
      const frame = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          document
            .getElementById(`sense-${senseId}`)
            ?.scrollIntoView({ block: 'start' });
        });
      });

      return () => window.cancelAnimationFrame(frame);
    }

    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [collapseOthers, senseIdByFragment]);

  return null;
}
