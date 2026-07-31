import { v } from "convex/values";
import { query } from "./_generated/server";

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
    const sources = await ctx.db.query("sources").withIndex("by_slug").take(200);
    return sources.map(publicSource);
  },
});

export const bySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const source = await ctx.db
      .query("sources")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug.trim().toLowerCase()))
      .unique();
    return source ? publicSource(source) : null;
  },
});

export const citedEntries = query({
  args: { sourceSlug: v.string(), page: v.number(), pageSize: v.number() },
  handler: async (ctx, args) => {
    const page = Math.max(1, Math.min(10, Math.floor(args.page)));
    const pageSize = Math.max(1, Math.min(100, Math.floor(args.pageSize)));
    const links = await ctx.db
      .query("entrySources")
      .withIndex("by_sourceSlug_and_normalizedTitle", (q) => q.eq("sourceSlug", args.sourceSlug))
      .take(page * pageSize + 1);
    const pageLinks = links.slice((page - 1) * pageSize, page * pageSize);
    const entries = [];
    for (const link of pageLinks) {
      const entry = await ctx.db.get(link.entryId);
      if (!entry) continue;
      entries.push({
        key: entry.key,
        entryType: entry.entryType,
        slug: entry.slug,
        title: entry.title,
        summaryText: entry.summaryText ?? null,
        updatedAt: entry.updatedAt,
      });
    }
    return { entries, hasMore: links.length > page * pageSize };
  },
});
