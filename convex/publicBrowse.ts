import { v } from "convex/values";
import { query } from "./_generated/server";
import { entryType } from "./schema";
import { tagNames, type EntrySummary } from "./publicEntries";

// Browse letter buckets scan at most this many index rows. The page cap (10)
// bounds what the UI can show anyway; a bucket larger than this signals the
// taxonomy needs finer letters, not a bigger scan.
const LETTER_SCAN_LIMIT = 1000;

function letterRange(letter: string): { start: string; end: string } {
  if (letter === "0-9") return { start: "0", end: "9￿" };
  return { start: letter, end: `${letter}￿` };
}

export const browse = query({
  args: {
    entryType,
    letter: v.string(),
    page: v.number(),
    pageSize: v.number(),
    sort: v.union(v.literal("title"), v.literal("updated")),
    query: v.string(),
    tagSlug: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const page = Math.max(1, Math.min(10, Math.floor(args.page)));
    const pageSize = Math.max(1, Math.min(100, Math.floor(args.pageSize)));

    const allTags = await ctx.db.query("tags").withIndex("by_slug").take(500);
    const activeTag = args.tagSlug ? (allTags.find((tag) => tag.slug === args.tagSlug) ?? null) : null;

    const { start, end } = letterRange(args.letter);
    let rows = await ctx.db
      .query("entries")
      .withIndex("by_entryType_and_normalizedTitle", (q) =>
        q.eq("entryType", args.entryType).gte("normalizedTitle", start).lt("normalizedTitle", end),
      )
      .take(LETTER_SCAN_LIMIT);

    const filterQuery = args.query.trim().toLowerCase();
    if (filterQuery) {
      rows = rows.filter(
        (entry) =>
          entry.normalizedTitle.includes(filterQuery) ||
          entry.slug.includes(filterQuery) ||
          entry.aliases.some((alias) => alias.toLowerCase().includes(filterQuery)),
      );
    }
    if (activeTag) {
      rows = rows.filter((entry) => entry.tagSlugs.includes(activeTag.slug));
    }
    if (args.sort === "updated") {
      rows.sort((a, b) => b.updatedAt - a.updatedAt || a.normalizedTitle.localeCompare(b.normalizedTitle));
    } else {
      rows.sort((a, b) => a.normalizedTitle.localeCompare(b.normalizedTitle));
    }

    const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
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

    return {
      activeTag: activeTag ? { slug: activeTag.slug, name: activeTag.name } : null,
      tags: allTags.map((tag) => ({ slug: tag.slug, name: tag.name })),
      entries,
      totalMatches: rows.length,
      hasMore: rows.length > page * pageSize,
    };
  },
});
