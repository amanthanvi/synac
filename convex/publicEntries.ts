import { v } from 'convex/values';
import { query } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import { activeGeneration } from './lib/contentGeneration';
import { entryType } from './schema';

export type EntrySummary = {
  key: string;
  entryType: 'TERM' | 'ACRONYM';
  slug: string;
  title: string;
  summaryText: string | null;
  senseSummary: string | null;
  updatedAt: number;
  tags: Array<{ slug: string; name: string }>;
};

export async function tagNames(
  ctx: QueryCtx,
  syncVersion: string,
  slugs: string[],
): Promise<Array<{ slug: string; name: string }>> {
  const tags: Array<{ slug: string; name: string }> = [];
  for (const slug of slugs) {
    const tag = await ctx.db
      .query('tags')
      .withIndex('by_syncVersion_and_slug', (q) =>
        q.eq('syncVersion', syncVersion).eq('slug', slug),
      )
      .unique();
    if (tag) tags.push({ slug: tag.slug, name: tag.name });
  }
  return tags;
}

/**
 * Resolves a public URL slug to its canonical entry, following redirects.
 * Returns null when the slug is unknown under either entry type.
 */
export const resolveBySlug = query({
  args: { entryType, slug: v.string() },
  handler: async (ctx, args) => {
    const generation = await activeGeneration(ctx);
    if (!generation) return null;
    const slug = args.slug.trim().toLowerCase();
    for (const type of [
      args.entryType,
      args.entryType === 'TERM' ? ('ACRONYM' as const) : ('TERM' as const),
    ]) {
      const entry = await ctx.db
        .query('entries')
        .withIndex('by_syncVersion_and_entryType_and_slug', (q) =>
          q
            .eq('syncVersion', generation.version)
            .eq('entryType', type)
            .eq('slug', slug),
        )
        .unique();
      if (entry) {
        return {
          entryType: type,
          canonicalSlug: entry.slug,
          needsRedirect: type !== args.entryType,
        };
      }
      const redirect = await ctx.db
        .query('redirects')
        .withIndex('by_syncVersion_and_entryType_and_fromSlug', (q) =>
          q
            .eq('syncVersion', generation.version)
            .eq('entryType', type)
            .eq('fromSlug', slug),
        )
        .unique();
      if (redirect) {
        return {
          entryType: type,
          canonicalSlug: redirect.toSlug,
          needsRedirect: true,
        };
      }
    }
    return null;
  },
});

/** Everything the public entry page renders, in one call. */
export const getEntryPage = query({
  args: {
    entryType,
    slug: v.string(),
    relationshipLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const generation = await activeGeneration(ctx);
    if (!generation) return null;
    const slug = args.slug.trim().toLowerCase();
    const entry = await ctx.db
      .query('entries')
      .withIndex('by_syncVersion_and_entryType_and_slug', (q) =>
        q
          .eq('syncVersion', generation.version)
          .eq('entryType', args.entryType)
          .eq('slug', slug),
      )
      .unique();
    if (!entry) return null;

    const senses = await ctx.db
      .query('senses')
      .withIndex('by_entryId', (q) => q.eq('entryId', entry._id))
      .take(100);
    senses.sort((a, b) => a.order - b.order);

    const limit = Math.max(
      1,
      Math.min(50, Math.floor(args.relationshipLimit ?? 50)),
    );
    const relationshipRows = await ctx.db
      .query('relationships')
      .withIndex('by_fromEntryId', (q) => q.eq('fromEntryId', entry._id))
      .take(limit);
    const relationships: Array<{
      type: 'RELATED' | 'SEE_ALSO' | 'CONTRAST';
      entry: {
        key: string;
        entryType: 'TERM' | 'ACRONYM';
        slug: string;
        title: string;
        summaryText: string | null;
      };
    }> = [];
    for (const rel of relationshipRows) {
      const target = await ctx.db.get(rel.toEntryId);
      if (!target || target.syncVersion !== generation.version) continue;
      relationships.push({
        type: rel.type,
        entry: {
          key: target.key,
          entryType: target.entryType,
          slug: target.slug,
          title: target.title,
          summaryText: target.summaryText ?? null,
        },
      });
    }

    return {
      entry: {
        key: entry.key,
        entryType: entry.entryType,
        slug: entry.slug,
        title: entry.title,
        aliases: entry.aliases,
        summaryMd: entry.summaryMd ?? null,
        summaryText: entry.summaryText ?? null,
        editorialNotes: entry.editorialNotes ?? null,
        updatedAt: entry.updatedAt,
        tags: await tagNames(ctx, generation.version, entry.tagSlugs),
        senses: senses.map((sense) => ({
          key: sense.key,
          order: sense.order,
          label: sense.label ?? null,
          definitionMd: sense.definitionMd,
          definitionText: sense.definitionText,
          expandedForm: sense.expandedForm ?? null,
          isEditorial: sense.isEditorial,
          editorialRationale: sense.editorialRationale ?? null,
          isPreferred: sense.isPreferred,
          examples: sense.examples,
          citations: sense.citations,
        })),
      },
      relationships,
    };
  },
});

/** Recently updated entries for the home page and /recent, newest first. */
export const listRecent = query({
  args: { page: v.number(), pageSize: v.number() },
  handler: async (ctx, args) => {
    const generation = await activeGeneration(ctx);
    if (!generation) return { entries: [], hasMore: false };
    const page = Math.max(1, Math.min(10, Math.floor(args.page)));
    const pageSize = Math.max(1, Math.min(50, Math.floor(args.pageSize)));
    const rows = await ctx.db
      .query('entries')
      .withIndex('by_syncVersion_and_updatedAt', (q) =>
        q.eq('syncVersion', generation.version),
      )
      .order('desc')
      .take(page * pageSize + 1);
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
        tags: await tagNames(ctx, generation.version, entry.tagSlugs),
      });
    }
    return { entries, hasMore: rows.length > page * pageSize };
  },
});
