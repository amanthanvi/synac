'use client';

import { useEffect } from 'react';

type ViewTrackerProps = {
  entryId: string;
};

export function ViewTracker({ entryId }: ViewTrackerProps) {
  useEffect(() => {
    if (!entryId) return;

    const payload = JSON.stringify({ entryId });

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
  }, [entryId]);

  return null;
}

