'use client';

import { useEffect } from 'react';

type ViewTrackerProps = {
  entryKey: string;
};

export function ViewTracker({ entryKey }: ViewTrackerProps) {
  useEffect(() => {
    if (!entryKey) return;

    const payload = JSON.stringify({ entryKey });

    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon('/api/v1/view', blob);
      return;
    }

    fetch('/api/v1/view', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }, [entryKey]);

  return null;
}
