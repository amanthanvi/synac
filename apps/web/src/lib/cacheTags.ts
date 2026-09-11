import { revalidateTag } from 'next/cache';

import { logger } from './logger';

/**
 * Cache tags shared between the public pages (which wrap their `@synac/db`
 * loaders in `unstable_cache`) and the write paths here (publish, archive,
 * rollback, tag create/rename/merge, source enable/disable), which invalidate
 * them.
 *
 * The names are a contract with the page layer, so keep them in sync with the
 * tag lists passed to `unstable_cache`.
 */
export const CACHE_TAG = {
  entries: 'entries',
  tags: 'tags',
  sources: 'sources',
  search: 'search',
} as const;

export type EntryTypeLike = 'TERM' | 'ACRONYM' | 'term' | 'acronym';

/**
 * `entry:<entryType>:<slug>`.
 *
 * Emitted in both casings by {@link revalidateEntry} because the page layer and
 * the API layer name the entry type differently (`TERM` in the DB enum,
 * `term` in the URL segment); tagging both makes invalidation casing-proof.
 */
export function entryTag(entryType: EntryTypeLike, slug: string): string {
  return `entry:${entryType}:${slug}`;
}

export function tagTag(slug: string): string {
  return `tag:${slug}`;
}

export function sourceTag(slug: string): string {
  return `source:${slug}`;
}

/**
 * `revalidateTag` throws when called outside a request/action scope (for
 * example from a background job or a test). Invalidation is best-effort: a
 * stale page for up to `s-maxage` is far better than a failed publish.
 */
function safeRevalidate(tags: readonly string[]): string[] {
  const applied: string[] = [];
  for (const tag of tags) {
    if (!tag) continue;
    try {
      // Next 16 requires a cache profile; `'max'` expires every entry carrying
      // the tag, which is what an on-demand purge means here.
      revalidateTag(tag, 'max');
      applied.push(tag);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Called outside a request/action scope (a background job, a unit test).
      // That is the documented best-effort case, not a fault worth a warning.
      const outOfScope = message.includes('static generation store');
      if (outOfScope) logger.debug('cache.revalidate_skipped', { tag });
      else logger.warn('cache.revalidate_failed', { tag, error: message });
    }
  }
  return applied;
}

/** Invalidate an arbitrary tag list (used by `POST /api/v1/internal/revalidate`). */
export function revalidateTags(tags: readonly string[]): string[] {
  return safeRevalidate(tags);
}

/**
 * Everything that changes when an entry is published, archived, or rolled back:
 * its own page, every listing that could contain it, and search.
 */
export function revalidateEntry(input: {
  entryType: EntryTypeLike;
  slug: string;
  tagSlugs?: readonly string[];
  previousSlugs?: readonly string[];
}): string[] {
  const upper =
    input.entryType.toUpperCase() === 'ACRONYM' ? 'ACRONYM' : 'TERM';
  const lower = upper.toLowerCase() as 'term' | 'acronym';

  const slugs = [input.slug, ...(input.previousSlugs ?? [])].filter(Boolean);

  const tags = [
    ...slugs.flatMap((slug) => [entryTag(upper, slug), entryTag(lower, slug)]),
    CACHE_TAG.entries,
    CACHE_TAG.search,
    ...(input.tagSlugs ?? []).map(tagTag),
    ...(input.tagSlugs?.length ? [CACHE_TAG.tags] : []),
  ];

  return safeRevalidate(tags);
}

/** Tag created, renamed, or merged. */
export function revalidateTagEntity(input: {
  slugs: readonly string[];
  affectsEntries?: boolean;
}): string[] {
  return safeRevalidate([
    CACHE_TAG.tags,
    ...input.slugs.filter(Boolean).map(tagTag),
    ...(input.affectsEntries ? [CACHE_TAG.entries, CACHE_TAG.search] : []),
  ]);
}

/** Source enabled, disabled, or edited. */
export function revalidateSource(input: { slug?: string | null }): string[] {
  return safeRevalidate([
    CACHE_TAG.sources,
    ...(input.slug ? [sourceTag(input.slug)] : []),
  ]);
}
