'use client';

import { SpeedInsights } from '@vercel/speed-insights/next';

import { beforeInsightsSend } from '@/lib/insights';

/**
 * Vercel's measurement scripts. The root layout is a server component and
 * cannot pass `beforeSend` across the client boundary, so it lives here.
 * Development builds load debug scripts from va.vercel-scripts.com, which the
 * development CSP blocks, so nothing renders outside production builds.
 */
export function VercelInsights() {
  if (process.env.NODE_ENV !== 'production') return null;

  return <SpeedInsights beforeSend={beforeInsightsSend} />;
}
