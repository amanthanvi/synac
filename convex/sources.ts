import { v } from 'convex/values';
import { query } from './_generated/server';
import { tagNames } from './publicEntries';
import { activeGeneration } from './lib/contentGeneration';

function publicSource(source: {
  slug: string;
  name: string;
  baseUrl: string;
  licenseType: string;
  licenseUrl?: string;
  licenseNotes?: string;
  allowedUse: string;
  attributionRequirements: string;
  trustTier: string;
  enabled: boolean;
  lastVerifiedAt: number;
  citedEntryCount: number;
}) {
  return {
    slug: source.slug,
    name: source.name,
    baseUrl: source.baseUrl,
    licenseType: source.licenseType,
    licenseUrl: source.licenseUrl ?? null,
    licenseNotes: source.licenseNotes ?? null,
    allowedUse: source.allowedUse,
    attributionRequirements: source.attributionRequirements,
    trustTier: source.trustTier,
    enabled: source.enabled,
    lastVerifiedAt: source.lastVerifiedAt,
    citedEntryCount: source.citedEntryCount,
  };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const generation = await activeGeneration(ctx);
    if (!generation) return [];
    const sources = await ctx.db
      .query('sources')
      .withIndex('by_syncVersion_and_slug', (q) =>
        q.eq('syncVersion', generation.version),
      )
      .take(200);
    return sources.map(publicSource);
  },
});

export const bySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const generation = await activeGeneration(ctx);
    if (!generation) return null;
    const source = await ctx.db
      .query('sources')
      .withIndex('by_syncVersion_and_slug', (q) =>
        q
          .eq('syncVersion', generation.version)
          .eq('slug', args.slug.trim().toLowerCase()),
      )
      .unique();
    return source ? publicSource(source) : null;
  },
});

export const citedEntries = query({
  args: { sourceSlug: v.string(), page: v.number(), pageSize: v.number() },
  handler: async (ctx, args) => {
    const generation = await activeGeneration(ctx);
    if (!generation) return { entries: [], hasMore: false };
    const sourceSlug = args.sourceSlug.trim().toLowerCase();
    const page = Math.max(1, Math.min(10, Math.floor(args.page)));
    const pageSize = Math.max(1, Math.min(100, Math.floor(args.pageSize)));
    const links = await ctx.db
      .query('entrySources')
      .withIndex('by_syncVersion_and_sourceSlug_and_normalizedTitle', (q) =>
        q.eq('syncVersion', generation.version).eq('sourceSlug', sourceSlug),
      )
      .take(page * pageSize + 1);
    const pageLinks = links.slice((page - 1) * pageSize, page * pageSize);
    const entries = [];
    for (const link of pageLinks) {
      const entry = await ctx.db.get(link.entryId);
      if (!entry || entry.syncVersion !== generation.version) continue;
      entries.push({
        key: entry.key,
        entryType: entry.entryType,
        slug: entry.slug,
        title: entry.title,
        summaryText: entry.summaryText ?? null,
        updatedAt: entry.updatedAt,
        tags: await tagNames(ctx, generation.version, entry.tagSlugs),
      });
    }
    return { entries, hasMore: links.length > page * pageSize };
  },
});
