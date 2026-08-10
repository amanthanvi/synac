import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { query } from './_generated/server';
import { entryType } from './schema';
import { activeGeneration } from './lib/contentGeneration';

/** Entry slugs for the sitemaps; callers page through with the cursor. */
export const entrySlugsPage = query({
  args: {
    entryType,
    paginationOpts: paginationOptsValidator,
    expectedVersion: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const expectedVersion = args.expectedVersion ?? null;
    const generation = await activeGeneration(ctx);
    if (!generation) {
      return {
        page: [],
        isDone: true,
        continueCursor: '',
        contentVersion: null,
        generationChanged: expectedVersion !== null,
      };
    }
    if (expectedVersion !== null && expectedVersion !== generation.version) {
      return {
        page: [],
        isDone: true,
        continueCursor: '',
        contentVersion: generation.version,
        generationChanged: true,
      };
    }
    const page = await ctx.db
      .query('entries')
      .withIndex('by_syncVersion_and_entryType_and_slug', (q) =>
        q.eq('syncVersion', generation.version).eq('entryType', args.entryType),
      )
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page.map((entry) => ({
        slug: entry.slug,
        updatedAt: entry.updatedAt,
      })),
      contentVersion: generation.version,
      generationChanged: false,
    };
  },
});

export const tagSlugs = query({
  args: {},
  handler: async (ctx) => {
    const generation = await activeGeneration(ctx);
    if (!generation) return [];
    const tags = await ctx.db
      .query('tags')
      .withIndex('by_syncVersion_and_slug', (q) =>
        q.eq('syncVersion', generation.version),
      )
      .take(1000);
    return tags.map((tag) => ({ slug: tag.slug }));
  },
});

export const sourceSlugs = query({
  args: {},
  handler: async (ctx) => {
    const generation = await activeGeneration(ctx);
    if (!generation) return [];
    const sources = await ctx.db
      .query('sources')
      .withIndex('by_syncVersion_and_slug', (q) =>
        q.eq('syncVersion', generation.version),
      )
      .take(1000);
    return sources.map((source) => ({
      slug: source.slug,
      lastVerifiedAt: source.lastVerifiedAt,
    }));
  },
});
