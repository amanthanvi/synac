import { v, type Infer } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  citationValidator,
  entryType,
  exampleValidator,
  relationshipType,
} from "./schema";

// The sync pipeline (tools/content/sync.ts) pushes the compiled content/
// dataset through these internal mutations: upsert* per table in chunks, then
// finish() records the new contentVersion and schedules pruning of rows the
// new dataset no longer contains (their syncVersion differs).

const sourceRow = v.object({
  slug: v.string(),
  name: v.string(),
  baseUrl: v.string(),
  licenseType: v.string(),
  licenseUrl: v.optional(v.string()),
  licenseNotes: v.optional(v.string()),
  allowedUse: v.string(),
  attributionRequirements: v.string(),
  trustTier: v.string(),
  enabled: v.boolean(),
  lastVerifiedAt: v.number(),
  citedEntryCount: v.number(),
});

const tagRow = v.object({
  slug: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  entryCount: v.number(),
});

const senseRow = v.object({
  key: v.string(),
  order: v.number(),
  label: v.optional(v.string()),
  definitionMd: v.string(),
  definitionText: v.string(),
  expandedForm: v.optional(v.string()),
  isEditorial: v.boolean(),
  editorialRationale: v.optional(v.string()),
  isPreferred: v.boolean(),
  examples: v.array(exampleValidator),
  citations: v.array(citationValidator),
});

const entryRow = v.object({
  key: v.string(),
  entryType,
  slug: v.string(),
  title: v.string(),
  normalizedTitle: v.string(),
  aliases: v.array(v.string()),
  summaryMd: v.optional(v.string()),
  summaryText: v.optional(v.string()),
  editorialNotes: v.optional(v.string()),
  updatedAt: v.number(),
  senseCount: v.number(),
  senseSummary: v.optional(v.string()),
  searchDocument: v.string(),
  tagSlugs: v.array(v.string()),
  citedSourceSlugs: v.array(v.string()),
  senses: v.array(senseRow),
});

const relationshipRow = v.object({
  fromKey: v.string(),
  toKey: v.string(),
  type: relationshipType,
});

const redirectRow = v.object({
  entryType,
  fromSlug: v.string(),
  toSlug: v.string(),
});

export const upsertSources = internalMutation({
  args: { syncVersion: v.string(), rows: v.array(sourceRow) },
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      const existing = await ctx.db
        .query("sources")
        .withIndex("by_slug", (q) => q.eq("slug", row.slug))
        .unique();
      if (existing) await ctx.db.patch(existing._id, { ...row, syncVersion: args.syncVersion });
      else await ctx.db.insert("sources", { ...row, syncVersion: args.syncVersion });
    }
    return null;
  },
});

export const upsertTags = internalMutation({
  args: { syncVersion: v.string(), rows: v.array(tagRow) },
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      const existing = await ctx.db
        .query("tags")
        .withIndex("by_slug", (q) => q.eq("slug", row.slug))
        .unique();
      if (existing) await ctx.db.patch(existing._id, { ...row, syncVersion: args.syncVersion });
      else await ctx.db.insert("tags", { ...row, syncVersion: args.syncVersion });
    }
    return null;
  },
});

async function upsertEntry(
  ctx: MutationCtx,
  syncVersion: string,
  row: Infer<typeof entryRow>,
): Promise<void> {
  const { senses, ...entryFields } = row;
  const existing = await ctx.db
    .query("entries")
    .withIndex("by_key", (q) => q.eq("key", row.key))
    .unique();
  let entryId;
  if (existing) {
    await ctx.db.patch(existing._id, { ...entryFields, syncVersion });
    entryId = existing._id;
  } else {
    entryId = await ctx.db.insert("entries", { ...entryFields, syncVersion });
  }

  for (const sense of senses) {
    const existingSense = await ctx.db
      .query("senses")
      .withIndex("by_entryKey_and_key", (q) => q.eq("entryKey", row.key).eq("key", sense.key))
      .unique();
    const senseFields = { ...sense, entryId, entryKey: row.key, syncVersion };
    if (existingSense) await ctx.db.patch(existingSense._id, senseFields);
    else await ctx.db.insert("senses", senseFields);
  }

  for (const tagSlug of row.tagSlugs) {
    const existingLink = await ctx.db
      .query("entryTags")
      .withIndex("by_entryKey_and_tagSlug", (q) => q.eq("entryKey", row.key).eq("tagSlug", tagSlug))
      .unique();
    const link = { entryId, entryKey: row.key, tagSlug, updatedAt: row.updatedAt, syncVersion };
    if (existingLink) await ctx.db.patch(existingLink._id, link);
    else await ctx.db.insert("entryTags", link);
  }

  for (const sourceSlug of row.citedSourceSlugs) {
    const existingLink = await ctx.db
      .query("entrySources")
      .withIndex("by_entryKey_and_sourceSlug", (q) =>
        q.eq("entryKey", row.key).eq("sourceSlug", sourceSlug),
      )
      .unique();
    const link = {
      entryId,
      entryKey: row.key,
      sourceSlug,
      normalizedTitle: row.normalizedTitle,
      syncVersion,
    };
    if (existingLink) await ctx.db.patch(existingLink._id, link);
    else await ctx.db.insert("entrySources", link);
  }
}

export const upsertEntries = internalMutation({
  args: { syncVersion: v.string(), rows: v.array(entryRow) },
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      await upsertEntry(ctx, args.syncVersion, row);
    }
    return null;
  },
});

/** Second pass: both endpoints must already exist. */
export const upsertRelationships = internalMutation({
  args: { syncVersion: v.string(), rows: v.array(relationshipRow) },
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      const from = await ctx.db
        .query("entries")
        .withIndex("by_key", (q) => q.eq("key", row.fromKey))
        .unique();
      const to = await ctx.db
        .query("entries")
        .withIndex("by_key", (q) => q.eq("key", row.toKey))
        .unique();
      if (!from || !to) throw new Error(`relationship endpoints missing: ${row.fromKey} -> ${row.toKey}`);
      const existing = await ctx.db
        .query("relationships")
        .withIndex("by_fromKey_and_toKey_and_type", (q) =>
          q.eq("fromKey", row.fromKey).eq("toKey", row.toKey).eq("type", row.type),
        )
        .unique();
      const fields = { ...row, fromEntryId: from._id, toEntryId: to._id, syncVersion: args.syncVersion };
      if (existing) await ctx.db.patch(existing._id, fields);
      else await ctx.db.insert("relationships", fields);
    }
    return null;
  },
});

export const upsertRedirects = internalMutation({
  args: { syncVersion: v.string(), rows: v.array(redirectRow) },
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      const existing = await ctx.db
        .query("redirects")
        .withIndex("by_entryType_and_fromSlug", (q) =>
          q.eq("entryType", row.entryType).eq("fromSlug", row.fromSlug),
        )
        .unique();
      if (existing) await ctx.db.patch(existing._id, { ...row, syncVersion: args.syncVersion });
      else await ctx.db.insert("redirects", { ...row, syncVersion: args.syncVersion });
    }
    return null;
  },
});

const PRUNE_TABLES = [
  "sources",
  "tags",
  "entries",
  "senses",
  "entryTags",
  "entrySources",
  "relationships",
  "redirects",
] as const;

const PRUNE_BATCH = 200;

/** Records the completed sync and kicks off pruning of rows from older syncs. */
export const finish = internalMutation({
  args: { syncVersion: v.string(), entryCount: v.number() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("syncMeta")
      .withIndex("by_key", (q) => q.eq("key", "content"))
      .unique();
    const meta = {
      key: "content" as const,
      contentVersion: args.syncVersion,
      syncedAt: Date.now(),
      entryCount: args.entryCount,
    };
    if (existing) await ctx.db.patch(existing._id, meta);
    else await ctx.db.insert("syncMeta", meta);
    await ctx.scheduler.runAfter(0, internal.sync.pruneBatch, { syncVersion: args.syncVersion });
    return null;
  },
});

/**
 * Deletes rows whose syncVersion differs from the current one, in batches,
 * rescheduling itself until nothing stale remains. syncVersion is a hex hash,
 * so "different version" is exactly the union of the two index ranges below.
 */
export const pruneBatch = internalMutation({
  args: { syncVersion: v.string() },
  handler: async (ctx, args) => {
    let deleted = 0;
    for (const table of PRUNE_TABLES) {
      if (deleted >= PRUNE_BATCH) break;
      const remaining = PRUNE_BATCH - deleted;
      const below = await ctx.db
        .query(table)
        .withIndex("by_syncVersion", (q) => q.lt("syncVersion", args.syncVersion))
        .take(remaining);
      const above = await ctx.db
        .query(table)
        .withIndex("by_syncVersion", (q) => q.gt("syncVersion", args.syncVersion))
        .take(Math.max(0, remaining - below.length));
      for (const row of [...below, ...above]) {
        await ctx.db.delete(row._id);
        deleted += 1;
      }
    }
    if (deleted >= PRUNE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.sync.pruneBatch, { syncVersion: args.syncVersion });
    }
    return { deleted };
  },
});

export const status = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("syncMeta")
      .withIndex("by_key", (q) => q.eq("key", "content"))
      .unique();
  },
});
