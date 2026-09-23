'use client';

import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

import { withoutQueryString } from '@/lib/insights';

/**
 * Vercel's measurement scripts. The root layout is a server component and
 * cannot pass `beforeSend` across the client boundary, so it lives here.
 */
export function VercelInsights() {
  return (
    <>
      <Analytics beforeSend={withoutQueryString} />
      <SpeedInsights beforeSend={withoutQueryString} />
    </>
  );
}
