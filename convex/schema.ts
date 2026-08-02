import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const entryType = v.union(v.literal("TERM"), v.literal("ACRONYM"));
export const relationshipType = v.union(
  v.literal("RELATED"),
  v.literal("SEE_ALSO"),
  v.literal("CONTRAST"),
);

export const citationValidator = v.object({
  sourceSlug: v.string(),
  sourceName: v.string(),
  url: v.string(),
  documentTitle: v.optional(v.string()),
  citationText: v.optional(v.string()),
  licenseNote: v.optional(v.string()),
  attributionText: v.string(),
  accessedAt: v.number(),
  locator: v.optional(v.string()),
});

export const exampleValidator = v.object({
  md: v.string(),
  text: v.string(),
});

// Content tables are populated exclusively by the sync pipeline from the
// compiled content/ dataset. `syncVersion` carries the contentVersion hash of
// the sync that last touched a row; pruning deletes rows from older versions.
export default defineSchema({
  sources: defineTable({
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
    syncVersion: v.string(),
  })
    .index("by_slug", ["slug"])
    .index("by_syncVersion", ["syncVersion"]),

  tags: defineTable({
    slug: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    entryCount: v.number(),
    syncVersion: v.string(),
  })
    .index("by_slug", ["slug"])
    .index("by_syncVersion", ["syncVersion"]),

  entries: defineTable({
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
    syncVersion: v.string(),
  })
    .index("by_key", ["key"])
    .index("by_entryType_and_slug", ["entryType", "slug"])
    .index("by_entryType_and_normalizedTitle", ["entryType", "normalizedTitle"])
    .index("by_entryType_and_updatedAt", ["entryType", "updatedAt"])
    .index("by_normalizedTitle", ["normalizedTitle"])
    .index("by_updatedAt", ["updatedAt"])
    .index("by_syncVersion", ["syncVersion"])
    .searchIndex("search_searchDocument", {
      searchField: "searchDocument",
      filterFields: ["entryType"],
    }),

  senses: defineTable({
    entryId: v.id("entries"),
    entryKey: v.string(),
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
    syncVersion: v.string(),
  })
    .index("by_entryId", ["entryId"])
    .index("by_entryKey_and_key", ["entryKey", "key"])
    .index("by_syncVersion", ["syncVersion"]),

  entryTags: defineTable({
    entryId: v.id("entries"),
    entryKey: v.string(),
    tagSlug: v.string(),
    updatedAt: v.number(),
    syncVersion: v.string(),
  })
    .index("by_entryKey_and_tagSlug", ["entryKey", "tagSlug"])
    .index("by_tagSlug_and_updatedAt", ["tagSlug", "updatedAt"])
    .index("by_syncVersion", ["syncVersion"]),

  entrySources: defineTable({
    entryId: v.id("entries"),
    entryKey: v.string(),
    sourceSlug: v.string(),
    normalizedTitle: v.string(),
    syncVersion: v.string(),
  })
    .index("by_entryKey_and_sourceSlug", ["entryKey", "sourceSlug"])
    .index("by_sourceSlug_and_normalizedTitle", ["sourceSlug", "normalizedTitle"])
    .index("by_syncVersion", ["syncVersion"]),

  relationships: defineTable({
    fromEntryId: v.id("entries"),
    toEntryId: v.id("entries"),
    fromKey: v.string(),
    toKey: v.string(),
    type: relationshipType,
    syncVersion: v.string(),
  })
    .index("by_fromKey_and_toKey_and_type", ["fromKey", "toKey", "type"])
    .index("by_fromEntryId", ["fromEntryId"])
    .index("by_syncVersion", ["syncVersion"]),

  redirects: defineTable({
    entryType,
    fromSlug: v.string(),
    toSlug: v.string(),
    syncVersion: v.string(),
  })
    .index("by_entryType_and_fromSlug", ["entryType", "fromSlug"])
    .index("by_syncVersion", ["syncVersion"]),

  syncMeta: defineTable({
    key: v.literal("content"),
    contentVersion: v.string(),
    syncedAt: v.number(),
    entryCount: v.number(),
  }).index("by_key", ["key"]),

  // Runtime data — never touched by sync. Keyed by the entry's natural key so
  // rows survive content re-syncs.
  entryViews: defineTable({
    entryKey: v.string(),
    sessionHash: v.string(),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
    viewCount: v.number(),
  })
    .index("by_entryKey_and_sessionHash", ["entryKey", "sessionHash"])
    .index("by_lastSeenAt", ["lastSeenAt"]),
});
