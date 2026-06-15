import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const nullableString = v.optional(v.union(v.string(), v.null()));
const nullableNumber = v.optional(v.union(v.number(), v.null()));
const nullableBoolean = v.optional(v.union(v.boolean(), v.null()));
const json = v.optional(v.union(v.any(), v.null()));

const base = {
  id: v.string(),
};

export default defineSchema({
  entries: defineTable({
    ...base,
    entryType: v.string(),
    displayTitle: v.string(),
    normalizedTitle: v.string(),
    primarySlug: v.string(),
    status: v.string(),
    summaryMd: nullableString,
    summaryText: nullableString,
    editorialNotes: nullableString,
    createdAt: nullableNumber,
    updatedAt: nullableNumber,
    publishedAt: nullableNumber,
    createdByUserId: nullableString,
    updatedByUserId: nullableString,
    deletedAt: nullableNumber,
  })
    .index("by_appId", ["id"])
    .index("by_entryType_and_primarySlug", ["entryType", "primarySlug"])
    .index("by_entryType_and_normalizedTitle", ["entryType", "normalizedTitle"])
    .index("by_status_and_updatedAt", ["status", "updatedAt"])
    .index("by_status_and_entryType_and_updatedAt", ["status", "entryType", "updatedAt"]),

  entrySearch: defineTable({
    id: v.string(),
    entryId: v.string(),
    entryType: v.string(),
    normalizedTitle: v.string(),
    primarySlug: v.string(),
    searchDocument: v.string(),
    updatedAt: nullableNumber,
  })
    .index("by_appId", ["id"])
    .index("by_entryId", ["entryId"])
    .index("by_entryType", ["entryType"])
    .index("by_normalizedTitle", ["normalizedTitle"])
    .searchIndex("search_searchDocument", {
      searchField: "searchDocument",
      filterFields: ["entryType"],
    }),

  entryViews: defineTable({
    ...base,
    entryId: v.string(),
    sessionHash: v.string(),
    firstSeenAt: nullableNumber,
    lastSeenAt: nullableNumber,
  })
    .index("by_appId", ["id"])
    .index("by_entryId", ["entryId"])
    .index("by_entryId_and_sessionHash", ["entryId", "sessionHash"])
    .index("by_lastSeenAt", ["lastSeenAt"]),

  entrySlugHistory: defineTable({
    ...base,
    entryId: v.string(),
    entryType: v.string(),
    slug: v.string(),
    createdAt: nullableNumber,
  })
    .index("by_appId", ["id"])
    .index("by_entryId", ["entryId"])
    .index("by_entryType_and_slug", ["entryType", "slug"]),

  entryVariants: defineTable({
    ...base,
    entryId: v.string(),
    variantText: v.string(),
    normalizedVariant: v.string(),
    variantType: v.string(),
    createdAt: nullableNumber,
  })
    .index("by_appId", ["id"])
    .index("by_entryId", ["entryId"])
    .index("by_normalizedVariant", ["normalizedVariant"]),

  senses: defineTable({
    ...base,
    entryId: v.string(),
    senseOrder: v.number(),
    senseLabel: nullableString,
    definitionMd: nullableString,
    definitionText: nullableString,
    expandedForm: nullableString,
    originLanguage: nullableString,
    temporalContext: nullableString,
    isEditorial: v.optional(v.boolean()),
    editorialRationale: nullableString,
    isPreferred: v.optional(v.boolean()),
    status: v.string(),
    createdAt: nullableNumber,
    updatedAt: nullableNumber,
    publishedAt: nullableNumber,
    deletedAt: nullableNumber,
  })
    .index("by_appId", ["id"])
    .index("by_entryId_and_senseOrder", ["entryId", "senseOrder"])
    .index("by_status", ["status"]),

  senseExamples: defineTable({
    ...base,
    senseId: v.string(),
    exampleMd: nullableString,
    exampleText: nullableString,
    exampleOrder: v.number(),
  })
    .index("by_appId", ["id"])
    .index("by_senseId_and_exampleOrder", ["senseId", "exampleOrder"]),

  tags: defineTable({
    ...base,
    name: v.string(),
    slug: v.string(),
    description: nullableString,
    createdAt: nullableNumber,
    updatedAt: nullableNumber,
    deletedAt: nullableNumber,
  })
    .index("by_appId", ["id"])
    .index("by_slug", ["slug"])
    .index("by_name", ["name"]),

  tagSlugHistory: defineTable({
    ...base,
    tagId: v.string(),
    slug: v.string(),
    createdAt: nullableNumber,
  })
    .index("by_appId", ["id"])
    .index("by_tagId", ["tagId"])
    .index("by_slug", ["slug"]),

  entryTags: defineTable({
    id: v.string(),
    entryId: v.string(),
    tagId: v.string(),
  })
    .index("by_appId", ["id"])
    .index("by_entryId", ["entryId"])
    .index("by_tagId", ["tagId"])
    .index("by_entryId_and_tagId", ["entryId", "tagId"]),

  entryRelationships: defineTable({
    ...base,
    fromEntryId: v.string(),
    toEntryId: v.string(),
    relationshipType: v.string(),
    weight: v.optional(v.number()),
    createdAt: nullableNumber,
    createdByUserId: nullableString,
    deletedAt: nullableNumber,
  })
    .index("by_appId", ["id"])
    .index("by_fromEntryId", ["fromEntryId"])
    .index("by_toEntryId", ["toEntryId"]),

  sources: defineTable({
    ...base,
    name: v.string(),
    sourceSlug: v.string(),
    baseUrl: v.string(),
    cronSchedule: nullableString,
    licenseType: v.string(),
    licenseNotes: nullableString,
    allowedUse: v.string(),
    attributionRequirements: v.string(),
    accessMethod: v.string(),
    robotsPolicy: v.string(),
    rateLimitPolicy: json,
    contact: nullableString,
    lastVerifiedAt: nullableNumber,
    trustTier: v.string(),
    enabled: v.boolean(),
    notesInternal: nullableString,
    createdAt: nullableNumber,
    updatedAt: nullableNumber,
  })
    .index("by_appId", ["id"])
    .index("by_sourceSlug", ["sourceSlug"])
    .index("by_enabled", ["enabled"]),

  sourceDocuments: defineTable({
    ...base,
    sourceId: v.string(),
    url: v.string(),
    canonicalUrl: nullableString,
    title: nullableString,
    contentType: v.string(),
    etag: nullableString,
    lastModified: nullableString,
    fetchedAt: nullableNumber,
    contentSha256: v.string(),
    snapshotStorageUri: nullableString,
    snapshotAllowed: v.boolean(),
    doNotUse: v.optional(v.boolean()),
    doNotUseReason: nullableString,
    doNotUseAt: nullableNumber,
    doNotUseByUserId: nullableString,
    deletedAt: nullableNumber,
  })
    .index("by_appId", ["id"])
    .index("by_sourceId", ["sourceId"])
    .index("by_fetchedAt", ["fetchedAt"])
    .index("by_url", ["url"])
    .index("by_sourceId_and_url", ["sourceId", "url"]),

  citations: defineTable({
    ...base,
    sourceId: v.string(),
    sourceDocumentId: v.string(),
    url: v.string(),
    citationText: nullableString,
    licenseNote: nullableString,
    attributionText: nullableString,
    accessedAt: nullableNumber,
  })
    .index("by_appId", ["id"])
    .index("by_sourceId", ["sourceId"])
    .index("by_sourceId_and_accessedAt", ["sourceId", "accessedAt"])
    .index("by_sourceDocumentId", ["sourceDocumentId"]),

  fieldProvenance: defineTable({
    ...base,
    entityType: v.string(),
    entityId: v.string(),
    fieldName: v.string(),
    citationId: v.string(),
    contentMode: v.string(),
    extractionMethod: v.string(),
    extractorVersion: v.string(),
    extractedAt: nullableNumber,
    sourceLocator: json,
  })
    .index("by_appId", ["id"])
    .index("by_entityType_and_entityId", ["entityType", "entityId"])
    .index("by_citationId", ["citationId"]),

  ingestRuns: defineTable({
    ...base,
    sourceId: v.string(),
    startedAt: nullableNumber,
    finishedAt: nullableNumber,
    status: v.string(),
    triggeredBy: v.string(),
    triggeredByUserId: nullableString,
    configSnapshot: json,
    stats: json,
  })
    .index("by_appId", ["id"])
    .index("by_sourceId_and_startedAt", ["sourceId", "startedAt"])
    .index("by_status", ["status"])
    .index("by_status_and_finishedAt", ["status", "finishedAt"]),

  ingestItems: defineTable({
    ...base,
    ingestRunId: v.string(),
    sourceDocumentId: v.string(),
    itemKey: nullableString,
    stage: v.string(),
    proposedChange: json,
    stageOutputs: json,
    diff: json,
    confidenceScore: nullableNumber,
    licenseGate: v.string(),
    licenseGateReason: nullableString,
    error: nullableString,
  })
    .index("by_appId", ["id"])
    .index("by_ingestRunId_and_stage", ["ingestRunId", "stage"])
    .index("by_sourceDocumentId", ["sourceDocumentId"]),

  users: defineTable({
    ...base,
    email: v.string(),
    displayName: nullableString,
    authProvider: v.string(),
    providerSubject: nullableString,
    tokenIdentifier: nullableString,
    status: v.string(),
    createdAt: nullableNumber,
    lastLoginAt: nullableNumber,
  })
    .index("by_appId", ["id"])
    .index("by_email", ["email"])
    .index("by_tokenIdentifier", ["tokenIdentifier"]),

  roles: defineTable({
    ...base,
    name: v.string(),
  })
    .index("by_appId", ["id"])
    .index("by_name", ["name"]),

  userRoles: defineTable({
    id: v.string(),
    userId: v.string(),
    roleId: v.string(),
  })
    .index("by_appId", ["id"])
    .index("by_userId", ["userId"])
    .index("by_roleId", ["roleId"])
    .index("by_userId_and_roleId", ["userId", "roleId"]),

  auditEvents: defineTable({
    ...base,
    actorUserId: v.string(),
    action: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    before: json,
    after: json,
    createdAt: nullableNumber,
    requestId: nullableString,
    ipHash: nullableString,
  })
    .index("by_appId", ["id"])
    .index("by_entityType_and_entityId_and_createdAt", ["entityType", "entityId", "createdAt"])
    .index("by_createdAt", ["createdAt"]),

  takedownCases: defineTable({
    ...base,
    status: v.string(),
    sourceId: nullableString,
    sourceDocumentId: nullableString,
    entryId: nullableString,
    requesterContact: nullableString,
    requestText: v.string(),
    internalNotes: nullableString,
    actions: json,
    affectedEntityIds: json,
    createdAt: nullableNumber,
    updatedAt: nullableNumber,
    closedAt: nullableNumber,
    createdByUserId: v.string(),
  })
    .index("by_appId", ["id"])
    .index("by_status", ["status"])
    .index("by_createdAt", ["createdAt"]),

  rateLimitBuckets: defineTable({
    ...base,
    scope: v.string(),
    key: v.string(),
    windowStart: v.number(),
    count: v.number(),
    createdAt: nullableNumber,
    updatedAt: nullableNumber,
  })
    .index("by_appId", ["id"])
    .index("by_scope", ["scope"])
    .index("by_scope_and_key_and_windowStart", ["scope", "key", "windowStart"])
    .index("by_windowStart", ["windowStart"]),
});
