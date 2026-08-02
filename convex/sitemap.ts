import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query } from "./_generated/server";
import { entryType } from "./schema";

/** Entry slugs for the sitemaps; callers page through with the cursor. */
export const entrySlugsPage = query({
  args: { entryType, paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("entries")
      .withIndex("by_entryType_and_slug", (q) => q.eq("entryType", args.entryType))
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page.map((entry) => ({ slug: entry.slug, updatedAt: entry.updatedAt })),
    };
  },
});

export const tagSlugs = query({
  args: {},
  handler: async (ctx) => {
    const tags = await ctx.db.query("tags").withIndex("by_slug").take(1000);
    return tags.map((tag) => ({ slug: tag.slug }));
  },
});

export const sourceSlugs = query({
  args: {},
  handler: async (ctx) => {
    const sources = await ctx.db.query("sources").withIndex("by_slug").take(1000);
    return sources.map((source) => ({ slug: source.slug, lastVerifiedAt: source.lastVerifiedAt }));
  },
});
