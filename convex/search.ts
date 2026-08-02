import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

const STOPWORDS = ["a", "an", "and", "or", "the"];

/**
 * Glossary search: exact/prefix title matches rank above full-text matches
 * from the search index. Result shape matches /api/v1/search and the
 * command palette.
 */
export const search = query({
  args: {
    query: v.string(),
    entryType: v.optional(v.union(v.literal("TERM"), v.literal("ACRONYM"), v.null())),
    tagSlug: v.optional(v.union(v.string(), v.null())),
    page: v.number(),
    pageSize: v.number(),
  },
  handler: async (ctx, args) => {
    const raw = args.query.trim().slice(0, 120);
    if (!raw) return [];
    const q = raw.toLowerCase().replace(/\s+/g, " ");
    if (q.length <= 1 || STOPWORDS.includes(q)) return [];
    const slug = q.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const page = Math.max(1, Math.min(10, Math.floor(args.page)));
    const pageSize = Math.max(1, Math.min(50, Math.floor(args.pageSize)));
    const entryTypeFilter = args.entryType ?? null;
    const tagSlug = args.tagSlug ?? null;
    const candidateLimit = Math.min(200, Math.max(page * pageSize * 3, pageSize + 40));

    const candidates = new Map<string, Doc<"entries">>();
    const addRows = (rows: Doc<"entries">[]) => {
      for (const row of rows) {
        if (!candidates.has(row.key)) candidates.set(row.key, row);
      }
    };

    addRows(
      await ctx.db
        .query("entries")
        .withIndex("by_normalizedTitle", (index) => index.gte("normalizedTitle", q).lt("normalizedTitle", `${q}￿`))
        .take(candidateLimit),
    );
    if (q.includes(" ") || q.length >= 4) {
      addRows(
        await ctx.db
          .query("entries")
          .withSearchIndex("search_searchDocument", (search) =>
            entryTypeFilter
              ? search.search("searchDocument", raw).eq("entryType", entryTypeFilter)
              : search.search("searchDocument", raw),
          )
          .take(candidateLimit),
      );
    }
    if (slug) {
      for (const type of entryTypeFilter ? [entryTypeFilter] : (["TERM", "ACRONYM"] as const)) {
        const bySlug = await ctx.db
          .query("entries")
          .withIndex("by_entryType_and_slug", (index) => index.eq("entryType", type).eq("slug", slug))
          .unique();
        if (bySlug) addRows([bySlug]);
      }
    }

    const terms = q.split(" ").filter((term) => term && !STOPWORDS.includes(term));
    const matches = [];
    for (const entry of candidates.values()) {
      if (entryTypeFilter && entry.entryType !== entryTypeFilter) continue;
      if (tagSlug && !entry.tagSlugs.includes(tagSlug)) continue;
      const title = entry.normalizedTitle;
      const doc = entry.searchDocument.toLowerCase();
      const docIndex = doc.indexOf(q);
      const firstTermIndex =
        terms
          .map((term) => doc.indexOf(term))
          .filter((index) => index >= 0)
          .sort((left, right) => left - right)[0] ?? -1;
      const docMatches = docIndex >= 0 || (terms.length > 0 && terms.every((term) => doc.includes(term)));
      const snippetIndex = docIndex >= 0 ? docIndex : firstTermIndex;
      let bucket = 0;
      let score = 0;
      if (title === q || entry.slug === slug) {
        bucket = 1;
        score = 1000;
      } else if (title.startsWith(q) || (slug && entry.slug.startsWith(slug))) {
        bucket = 2;
        score = 800;
      } else if (docMatches) {
        bucket = 3;
        score = 400 + (snippetIndex >= 0 ? Math.max(0, 100 - snippetIndex) : 0);
      } else {
        continue;
      }
      matches.push({
        key: entry.key,
        entryType: entry.entryType,
        title: entry.title,
        slug: entry.slug,
        summaryText: entry.summaryText ?? null,
        snippet:
          snippetIndex >= 0
            ? entry.searchDocument.slice(Math.max(0, snippetIndex - 60), snippetIndex + 160)
            : null,
        senseCount: entry.entryType === "ACRONYM" ? entry.senseCount : null,
        senseSummary: entry.entryType === "ACRONYM" ? (entry.senseSummary ?? null) : null,
        bucket,
        score,
      });
    }
    matches.sort(
      (left, right) =>
        left.bucket - right.bucket || right.score - left.score || left.title.localeCompare(right.title),
    );
    return matches.slice((page - 1) * pageSize, page * pageSize);
  },
});
