import { v } from "convex/values";
import { query } from "./_generated/server";
import { tagNames, type EntrySummary } from "./publicEntries";

export const directory = query({
  args: {},
  handler: async (ctx) => {
    const tags = await ctx.db.query("tags").withIndex("by_slug").take(500);
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
    const tag = await ctx.db
      .query("tags")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug.trim().toLowerCase()))
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
    entryType: v.optional(v.union(v.literal("TERM"), v.literal("ACRONYM"), v.null())),
    page: v.number(),
    pageSize: v.number(),
  },
  handler: async (ctx, args) => {
    const page = Math.max(1, Math.min(10, Math.floor(args.page)));
    const pageSize = Math.max(1, Math.min(100, Math.floor(args.pageSize)));
    const links = await ctx.db
      .query("entryTags")
      .withIndex("by_tagSlug_and_updatedAt", (q) => q.eq("tagSlug", args.tagSlug))
      .order("desc")
      .take(1000);
    let tagged = [];
    for (const link of links) {
      const entry = await ctx.db.get(link.entryId);
      if (entry) tagged.push(entry);
    }
    if (args.entryType) tagged = tagged.filter((entry) => entry.entryType === args.entryType);
    const pageRows = tagged.slice((page - 1) * pageSize, page * pageSize);
    const entries: EntrySummary[] = [];
    for (const entry of pageRows) {
      entries.push({
        key: entry.key,
        entryType: entry.entryType,
        slug: entry.slug,
        title: entry.title,
        summaryText: entry.summaryText ?? null,
        senseSummary: entry.senseSummary ?? null,
        updatedAt: entry.updatedAt,
        tags: await tagNames(ctx, entry.tagSlugs),
      });
    }
    return { entries, hasMore: tagged.length > page * pageSize };
  },
});
