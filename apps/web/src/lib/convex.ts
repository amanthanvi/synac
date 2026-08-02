import { ConvexHttpClient } from 'convex/browser';

import { api } from '../../../../convex/_generated/api';

export { api };
export type { FunctionReturnType } from 'convex/server';

let client: ConvexHttpClient | null = null;

export function getConvexClient(): ConvexHttpClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
  if (!url) {
    throw new Error('NEXT_PUBLIC_CONVEX_URL (or CONVEX_URL) is not configured');
  }
  client = new ConvexHttpClient(url);
  return client;
}

/**
 * Auth for the anonymous runtime mutations (views, rate limits): the key is
 * held only by this server, so those endpoints cannot be driven directly from
 * the open internet.
 */
export function getServiceKey(): string {
  const key = process.env.SYNAC_CONVEX_SERVICE_KEY;
  if (!key) throw new Error('SYNAC_CONVEX_SERVICE_KEY is not configured');
  return key;
}
