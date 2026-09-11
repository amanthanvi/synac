import type { APIRequestContext, Page } from '@playwright/test';

/**
 * Seeded content the suite depends on. These slugs come from
 * `packages/db/prisma/seedContent.ts`; keep them in sync with the seed.
 */
export const SEEDED = {
  /** A seeded ACRONYM entry (canonical route: /acronym/mfa). */
  acronymSlug: 'mfa',
  /** A seeded ACRONYM entry with two senses (canonical route: /acronym/soc). */
  multiSenseAcronymSlug: 'soc',
  /** A seeded TERM entry (canonical route: /term/authentication). */
  termSlug: 'authentication',
  /** A query guaranteed to return at least one seeded result. */
  query: 'mfa',
  /** The query used by the Lighthouse budgets; may return zero results. */
  looseQuery: 'soc',
} as const;

/** Public entry hrefs look like `/term/<slug>` or `/acronym/<slug>`. */
export const ENTRY_LINK_SELECTOR = 'a[href^="/term/"], a[href^="/acronym/"]';

type SlugRow = {
  primarySlug?: string;
  slug?: string;
  primary_slug?: string;
};

/**
 * The list endpoints answer either with a bare array or with the rows under one
 * of a few wrapper keys, and the slug field has been renamed more than once, so
 * the suite accepts every shape it has shipped rather than pinning one.
 */
type SlugListBody =
  | SlugRow[]
  | Partial<Record<'items' | 'data' | 'results' | 'entries', SlugRow[]>>;

function firstSlug(body: SlugListBody): string | undefined {
  const rows = Array.isArray(body)
    ? body
    : (body.items ?? body.data ?? body.results ?? body.entries ?? []);

  const first = rows[0];
  if (!first) return undefined;

  for (const value of [first.primarySlug, first.slug, first.primary_slug]) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

/**
 * Resolves the first published acronym's public path from the read API, so
 * tests do not hard-code a slug that a re-seed might move.
 * Falls back to the seeded acronym when the API is unavailable.
 */
export async function firstAcronymPath(
  request: APIRequestContext,
): Promise<string> {
  const fallback = `/acronym/${SEEDED.acronymSlug}`;
  const response = await request.get('/api/v1/acronyms?page=1');
  if (!response.ok()) return fallback;

  const slug = firstSlug((await response.json()) as SlugListBody);
  return slug ? `/acronym/${slug}` : fallback;
}

/** Resolves the first tag page path, falling back to the tag directory. */
export async function firstTagPath(
  request: APIRequestContext,
): Promise<string> {
  const response = await request.get('/api/v1/tags?page=1');
  if (!response.ok()) return '/tags';

  const slug = firstSlug((await response.json()) as SlugListBody);
  return slug ? `/tags/${slug}` : '/tags';
}

/** Waits for hydration-sensitive interactions to be safe to drive. */
export async function gotoStable(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
}
