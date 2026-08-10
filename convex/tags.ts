import { v } from 'convex/values';
import { query } from './_generated/server';
import { tagNames, type EntrySummary } from './publicEntries';
import { activeGeneration } from './lib/contentGeneration';

// Format 1 links lack entryType. Bound their transitional point reads; every
// format 2 generation uses the exact compound index below instead.
const LEGACY_TYPED_LINK_SCAN_LIMIT = 1_000;

export const directory = query({
  args: {},
  handler: async (ctx) => {
    const generation = await activeGeneration(ctx);
    if (!generation) return [];
    const tags = await ctx.db
      .query('tags')
      .withIndex('by_syncVersion_and_slug', (q) =>
        q.eq('syncVersion', generation.version),
      )
      .take(500);
    return tags.map((tag) => ({
      slug: tag.slug,
      name: tag.name,
      description: tag.description ?? null,
      entryCount: tag.entryCount,
    }));
  },
});

export const bySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const generation = await activeGeneration(ctx);
    if (!generation) return null;
    const tag = await ctx.db
      .query('tags')
      .withIndex('by_syncVersion_and_slug', (q) =>
        q
          .eq('syncVersion', generation.version)
          .eq('slug', args.slug.trim().toLowerCase()),
      )
      .unique();
    if (!tag) return null;
    return {
      slug: tag.slug,
      name: tag.name,
      description: tag.description ?? null,
      entryCount: tag.entryCount,
    };
  },
});

export const entriesForTag = query({
  args: {
    tagSlug: v.string(),
    entryType: v.optional(
      v.union(v.literal('TERM'), v.literal('ACRONYM'), v.null()),
    ),
    page: v.number(),
    pageSize: v.number(),
  },
  handler: async (ctx, args) => {
    const generation = await activeGeneration(ctx);
    if (!generation) return { entries: [], hasMore: false };
    const page = Math.max(1, Math.floor(args.page));
    const pageSize = Math.max(1, Math.min(100, Math.floor(args.pageSize)));
    if (page > 100) return { entries: [], hasMore: false };
    const tagSlug = args.tagSlug.trim().toLowerCase();
    const linkLimit = page * pageSize + 1;
    const activeLinks =
      args.entryType && generation.formatVersion >= 2
        ? await ctx.db
            .query('entryTags')
            .withIndex(
              'by_syncVersion_and_tagSlug_and_entryType_and_updatedAt',
              (q) =>
                q
                  .eq('syncVersion', generation.version)
                  .eq('tagSlug', tagSlug)
                  .eq('entryType', args.entryType ?? undefined),
            )
            .order('desc')
            .take(linkLimit)
        : await ctx.db
            .query('entryTags')
            .withIndex('by_syncVersion_and_tagSlug_and_updatedAt', (q) =>
              q.eq('syncVersion', generation.version).eq('tagSlug', tagSlug),
            )
            .order('desc')
            .take(args.entryType ? LEGACY_TYPED_LINK_SCAN_LIMIT : linkLimit);
    const links: typeof activeLinks = [];
    if (args.entryType && generation.formatVersion < 2) {
      for (const link of activeLinks) {
        const entry = await ctx.db.get(link.entryId);
        if (
          entry?.syncVersion === generation.version &&
          entry.entryType === args.entryType
        ) {
          links.push(link);
          if (links.length >= linkLimit) break;
        }
      }
    } else {
      links.push(...activeLinks);
    }
    const pageLinks = links.slice((page - 1) * pageSize, page * pageSize);
    const tagged = [];
    for (const link of pageLinks) {
      const entry = await ctx.db.get(link.entryId);
      if (entry?.syncVersion === generation.version) tagged.push(entry);
    }
    const entries: EntrySummary[] = [];
    for (const entry of tagged) {
      entries.push({
        key: entry.key,
        entryType: entry.entryType,
        slug: entry.slug,
        title: entry.title,
        summaryText: entry.summaryText ?? null,
        senseSummary: entry.senseSummary ?? null,
        updatedAt: entry.updatedAt,
        tags: await tagNames(ctx, generation.version, entry.tagSlugs),
      });
    }
    return { entries, hasMore: links.length > page * pageSize };
  },
});

export const resolveSlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const generation = await activeGeneration(ctx);
    if (!generation) return null;
    const slug = args.slug.trim().toLowerCase();
    const tag = await ctx.db
      .query('tags')
      .withIndex('by_syncVersion_and_slug', (q) =>
        q.eq('syncVersion', generation.version).eq('slug', slug),
      )
      .unique();
    if (tag) return { kind: 'CANONICAL' as const, slug: tag.slug };
    const retired = await ctx.db
      .query('tagRedirects')
      .withIndex('by_syncVersion_and_fromSlug', (q) =>
        q.eq('syncVersion', generation.version).eq('fromSlug', slug),
      )
      .unique();
    if (!retired) return null;
    return retired.toSlug
      ? { kind: 'REDIRECT' as const, slug: retired.toSlug }
      : { kind: 'RETIRED' as const, slug: retired.fromSlug };
  },
});
