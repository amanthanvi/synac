import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import type { DataModel } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type ModelName =
  | "entry"
  | "entrySearch"
  | "entryView"
  | "entrySlugHistory"
  | "entryVariant"
  | "sense"
  | "senseExample"
  | "tag"
  | "tagSlugHistory"
  | "entryTag"
  | "entryRelationship"
  | "source"
  | "sourceDocument"
  | "citation"
  | "fieldProvenance"
  | "ingestRun"
  | "ingestItem"
  | "user"
  | "role"
  | "userRole"
  | "auditEvent"
  | "takedownCase"
  | "rateLimitBucket";

type TableName = keyof DataModel;
type GenericRecord = Record<string, unknown>;
type GenericDoc = GenericRecord & { id: string; _id: unknown; _creationTime: number };
type SortDirection = "asc" | "desc";

const TABLE_BY_MODEL: Record<ModelName, TableName> = {
  entry: "entries",
  entrySearch: "entrySearch",
  entryView: "entryViews",
  entrySlugHistory: "entrySlugHistory",
  entryVariant: "entryVariants",
  sense: "senses",
  senseExample: "senseExamples",
  tag: "tags",
  tagSlugHistory: "tagSlugHistory",
  entryTag: "entryTags",
  entryRelationship: "entryRelationships",
  source: "sources",
  sourceDocument: "sourceDocuments",
  citation: "citations",
  fieldProvenance: "fieldProvenance",
  ingestRun: "ingestRuns",
  ingestItem: "ingestItems",
  user: "users",
  role: "roles",
  userRole: "userRoles",
  auditEvent: "auditEvents",
  takedownCase: "takedownCases",
  rateLimitBucket: "rateLimitBuckets",
};

const MODEL_BY_TABLE = Object.fromEntries(
  Object.entries(TABLE_BY_MODEL).map(([model, table]) => [table, model]),
) as Record<TableName, ModelName>;

const DEFAULT_LIMIT = 500;
const MAX_ENTRY_SEARCH_DOCUMENT_CHARS = 6_000;
const PUBLIC_BROWSE_SCAN_LIMIT = 500;
const PUBLIC_RECENT_PAGE_SIZE_LIMIT = 50;
const PUBLIC_RECENT_SCAN_LIMIT = 200;
const PUBLIC_TAG_SCAN_LIMIT = 100;
const PUBLIC_TAG_LINK_SCAN_LIMIT = 500;
const PUBLIC_TAG_DIRECTORY_COUNT_LIMIT = 25;
const PUBLIC_SOURCE_SCAN_LIMIT = 100;
const PUBLIC_CITATION_SCAN_LIMIT = 500;
const PUBLIC_SOURCE_DIRECTORY_CITATION_COUNT_LIMIT = 25;
const PUBLIC_SOURCE_DIRECTORY_LATEST_LIMIT = 3;
const PUBLIC_PROVENANCE_SCAN_LIMIT = 50;
const SITEMAP_SCAN_LIMIT = 1000;
const ADMIN_DRY_RUN_SCAN_LIMIT = 500;
const SEARCH_COMPACTION_BATCH_LIMIT = 50;
const RATE_LIMIT_PRUNE_BATCH_LIMIT = 100;

function asModel(value: string): ModelName {
  if (value in TABLE_BY_MODEL) return value as ModelName;
  throw new Error(`Unsupported model: ${value}`);
}

function tableFor(model: ModelName): TableName {
  return TABLE_BY_MODEL[model];
}

function normalizeData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeData);
  if (!value || typeof value !== "object") return value;
  const out: GenericRecord = {};
  for (const [key, child] of Object.entries(value as GenericRecord)) {
    if (child === undefined) continue;
    out[key] = normalizeData(child);
  }
  return out;
}

function normalizeUpdateData(value: unknown, existing: GenericRecord): GenericRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: GenericRecord = {};
  for (const [key, child] of Object.entries(value as GenericRecord)) {
    if (child === undefined) continue;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      const op = child as GenericRecord;
      const opKeys = Object.keys(op);
      if (opKeys.length === 1 && typeof op.increment === "number") {
        out[key] = (typeof existing[key] === "number" ? existing[key] : 0) + op.increment;
        continue;
      }
      if (opKeys.length === 1 && typeof op.decrement === "number") {
        out[key] = (typeof existing[key] === "number" ? existing[key] : 0) - op.decrement;
        continue;
      }
      if (opKeys.length === 1 && "set" in op) {
        out[key] = normalizeData(op.set);
        continue;
      }
    }
    out[key] = normalizeData(child);
  }
  return out;
}

function now(): number {
  return Date.now();
}

function id(): string {
  return crypto.randomUUID();
}

function docRecord(doc: unknown): GenericDoc {
  return doc as GenericDoc;
}

function compactEntrySearchDocument(parts: unknown[]): string {
  const seen = new Set<string>();
  const values = [];
  for (const value of parts) {
    if (typeof value !== "string") continue;
    const text = value.replace(/\s+/g, " ").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    values.push(text);
  }
  return values.join(" ").slice(0, MAX_ENTRY_SEARCH_DOCUMENT_CHARS);
}

function publicEntry(row: GenericDoc): GenericRecord {
  return {
    id: row.id,
    entryType: row.entryType,
    displayTitle: row.displayTitle,
    primarySlug: row.primarySlug,
    summaryText: row.summaryText ?? null,
    summaryMd: row.summaryMd ?? null,
    updatedAt: row.updatedAt ?? null,
    publishedAt: row.publishedAt ?? null,
  };
}

function publicTag(row: GenericDoc): GenericRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
    updatedAt: row.updatedAt ?? null,
  };
}

function publicSource(row: GenericDoc): GenericRecord {
  return {
    id: row.id,
    name: row.name,
    sourceSlug: row.sourceSlug,
    baseUrl: row.baseUrl,
    licenseType: row.licenseType,
    licenseNotes: row.licenseNotes ?? null,
    allowedUse: row.allowedUse,
    attributionRequirements: row.attributionRequirements,
    contact: row.contact ?? null,
    lastVerifiedAt: row.lastVerifiedAt ?? null,
    trustTier: row.trustTier,
    enabled: row.enabled,
    updatedAt: row.updatedAt ?? null,
  };
}

function isPublishedEntry(row: GenericDoc | null): row is GenericDoc {
  return Boolean(row && row.status === "PUBLISHED" && !row.deletedAt);
}

function isLiveTag(row: GenericDoc | null): row is GenericDoc {
  return Boolean(row && !row.deletedAt);
}

async function entryById(ctx: QueryCtx | MutationCtx, entryId: string): Promise<GenericDoc | null> {
  return firstById(ctx, "entry", entryId);
}

async function allDocs(ctx: QueryCtx | MutationCtx, model: ModelName, limit = DEFAULT_LIMIT): Promise<GenericDoc[]> {
  const rows = await ctx.db.query(tableFor(model)).take(limit);
  return rows.map(docRecord);
}

function requestedLimit(argsInput: unknown): number {
  const args = argsInput && typeof argsInput === "object" ? (argsInput as GenericRecord) : {};
  const skip = typeof args.skip === "number" ? Math.max(0, Math.floor(args.skip)) : 0;
  const take = typeof args.take === "number" ? Math.max(0, Math.floor(args.take)) : DEFAULT_LIMIT;
  return Math.max(1, Math.min(DEFAULT_LIMIT, skip + take));
}

function equality(where: GenericRecord, field: string): unknown {
  const value = where[field];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const condition = value as GenericRecord;
    if ("equals" in condition) return condition.equals;
  }
  return value;
}

function stringEq(where: GenericRecord, field: string): string | null {
  const value = equality(where, field);
  return typeof value === "string" ? value : null;
}

function numberEq(where: GenericRecord, field: string): number | null {
  const value = equality(where, field);
  return typeof value === "number" ? value : null;
}

function booleanEq(where: GenericRecord, field: string): boolean | null {
  const value = equality(where, field);
  return typeof value === "boolean" ? value : null;
}

async function firstById(ctx: QueryCtx | MutationCtx, model: ModelName, rowId: string): Promise<GenericDoc | null> {
  const table = tableFor(model);
  const row = await ctx.db
    .query(table)
    .withIndex("by_appId" as never, (q) => q.eq("id" as never, rowId as never))
    .unique();
  return row ? docRecord(row) : null;
}

async function requireAdminForGenericWrite(ctx: MutationCtx, adminKey: string | null | undefined): Promise<void> {
  const secret = process.env.SYNAC_CONVEX_ADMIN_KEY;
  if (secret && adminKey === secret) return;
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.tokenIdentifier) {
    throw new Error("Unauthorized");
  }
  const user = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (index) => index.eq("tokenIdentifier", identity.tokenIdentifier))
    .first();
  const userDoc = user ? docRecord(user) : null;
  if (!userDoc || userDoc.status !== "ACTIVE") throw new Error("Unauthorized");
  const roles = await ctx.db.query("userRoles").withIndex("by_userId", (index) => index.eq("userId", userDoc.id)).take(20);
  for (const roleLink of roles.map(docRecord)) {
    const role = await firstById(ctx, "role", String(roleLink.roleId));
    if (role?.name === "ADMIN") return;
  }
  throw new Error("Forbidden");
}

async function requireAdminForGenericRead(ctx: QueryCtx, adminKey: string | null | undefined): Promise<void> {
  const secret = process.env.SYNAC_CONVEX_ADMIN_KEY;
  if (secret && adminKey === secret) return;
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.tokenIdentifier) {
    throw new Error("Unauthorized");
  }
  const user = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (index) => index.eq("tokenIdentifier", identity.tokenIdentifier))
    .first();
  const userDoc = user ? docRecord(user) : null;
  if (!userDoc || userDoc.status !== "ACTIVE") throw new Error("Unauthorized");
  const roles = await ctx.db.query("userRoles").withIndex("by_userId", (index) => index.eq("userId", userDoc.id)).take(20);
  for (const roleLink of roles.map(docRecord)) {
    const role = await firstById(ctx, "role", String(roleLink.roleId));
    if (role?.name === "ADMIN") return;
  }
  throw new Error("Forbidden");
}

function primitiveEqual(left: unknown, right: unknown): boolean {
  return left === right;
}

function relationModel(model: ModelName, relation: string): ModelName | null {
  const singular: Record<string, Partial<Record<string, ModelName>>> = {
    entryTag: { entry: "entry", tag: "tag" },
    fieldProvenance: { citation: "citation" },
    citation: { source: "source", sourceDocument: "sourceDocument" },
    ingestRun: { source: "source", triggeredByUser: "user" },
    ingestItem: { ingestRun: "ingestRun", sourceDocument: "sourceDocument" },
    userRole: { user: "user", role: "role" },
    sourceDocument: { source: "source", doNotUseByUser: "user" },
    takedownCase: { source: "source", sourceDocument: "sourceDocument", entry: "entry", createdByUser: "user" },
    auditEvent: { actorUser: "user" },
    entryRelationship: { fromEntry: "entry", toEntry: "entry", createdByUser: "user" },
  };
  return singular[model]?.[relation] ?? null;
}

function relationForeignKey(model: ModelName, relation: string): string | null {
  const keys: Record<string, Partial<Record<string, string>>> = {
    entryTag: { entry: "entryId", tag: "tagId" },
    fieldProvenance: { citation: "citationId" },
    citation: { source: "sourceId", sourceDocument: "sourceDocumentId" },
    ingestRun: { source: "sourceId", triggeredByUser: "triggeredByUserId" },
    ingestItem: { ingestRun: "ingestRunId", sourceDocument: "sourceDocumentId" },
    userRole: { user: "userId", role: "roleId" },
    sourceDocument: { source: "sourceId", doNotUseByUser: "doNotUseByUserId" },
    takedownCase: {
      source: "sourceId",
      sourceDocument: "sourceDocumentId",
      entry: "entryId",
      createdByUser: "createdByUserId",
    },
    auditEvent: { actorUser: "actorUserId" },
    entryRelationship: { fromEntry: "fromEntryId", toEntry: "toEntryId", createdByUser: "createdByUserId" },
  };
  return keys[model]?.[relation] ?? null;
}

function childRelation(model: ModelName, relation: string): { model: ModelName; key: string } | null {
  const children: Record<string, Partial<Record<string, { model: ModelName; key: string }>>> = {
    entry: {
      senses: { model: "sense", key: "entryId" },
      variants: { model: "entryVariant", key: "entryId" },
      entryTags: { model: "entryTag", key: "entryId" },
      slugHistory: { model: "entrySlugHistory", key: "entryId" },
      views: { model: "entryView", key: "entryId" },
      relationshipsFrom: { model: "entryRelationship", key: "fromEntryId" },
      relationshipsTo: { model: "entryRelationship", key: "toEntryId" },
      takedownCases: { model: "takedownCase", key: "entryId" },
    },
    sense: { examples: { model: "senseExample", key: "senseId" } },
    tag: {
      entryTags: { model: "entryTag", key: "tagId" },
      slugHistory: { model: "tagSlugHistory", key: "tagId" },
    },
    source: {
      documents: { model: "sourceDocument", key: "sourceId" },
      citations: { model: "citation", key: "sourceId" },
      ingestRuns: { model: "ingestRun", key: "sourceId" },
      takedownCases: { model: "takedownCase", key: "sourceId" },
    },
    sourceDocument: {
      citations: { model: "citation", key: "sourceDocumentId" },
      ingestItems: { model: "ingestItem", key: "sourceDocumentId" },
      takedownCases: { model: "takedownCase", key: "sourceDocumentId" },
    },
    ingestRun: { items: { model: "ingestItem", key: "ingestRunId" } },
    user: {
      roles: { model: "userRole", key: "userId" },
      auditEvents: { model: "auditEvent", key: "actorUserId" },
      ingestRunsTriggered: { model: "ingestRun", key: "triggeredByUserId" },
    },
  };
  return children[model]?.[relation] ?? null;
}

async function relatedOne(
  ctx: QueryCtx | MutationCtx,
  model: ModelName,
  doc: GenericDoc,
  relation: string,
): Promise<GenericDoc | null> {
  const target = relationModel(model, relation);
  const key = relationForeignKey(model, relation);
  if (!target || !key) return null;
  const targetId = doc[key];
  return typeof targetId === "string" ? firstById(ctx, target, targetId) : null;
}

async function relatedMany(
  ctx: QueryCtx | MutationCtx,
  model: ModelName,
  doc: GenericDoc,
  relation: string,
): Promise<GenericDoc[] | null> {
  const child = childRelation(model, relation);
  if (!child) return null;
  const rows = await indexedRowsForWhere(ctx, child.model, { [child.key]: doc.id }, DEFAULT_LIMIT);
  return (rows ?? (await allDocs(ctx, child.model))).filter((row) => row[child.key] === doc.id);
}

function expandCompoundWhere(where: GenericRecord): GenericRecord {
  const out: GenericRecord = {};
  for (const [key, value] of Object.entries(where)) {
    if (value && typeof value === "object" && !Array.isArray(value) && key.includes("_")) {
      for (const [childKey, childValue] of Object.entries(value as GenericRecord)) out[childKey] = childValue;
    } else {
      out[key] = value;
    }
  }
  return out;
}

async function matchesWhere(
  ctx: QueryCtx | MutationCtx,
  model: ModelName,
  doc: GenericDoc,
  whereInput: unknown,
): Promise<boolean> {
  if (!whereInput || typeof whereInput !== "object") return true;
  const where = expandCompoundWhere(whereInput as GenericRecord);
  for (const [key, expected] of Object.entries(where)) {
    if (key === "OR" && Array.isArray(expected)) {
      let matched = false;
      for (const branch of expected) {
        if (await matchesWhere(ctx, model, doc, branch)) matched = true;
      }
      if (!matched) return false;
      continue;
    }
    if (key === "AND" && Array.isArray(expected)) {
      for (const branch of expected) {
        if (!(await matchesWhere(ctx, model, doc, branch))) return false;
      }
      continue;
    }
    if (key === "NOT") {
      if (await matchesWhere(ctx, model, doc, expected)) return false;
      continue;
    }

    const nestedModel = relationModel(model, key);
    if (nestedModel && expected && typeof expected === "object") {
      const related = await relatedOne(ctx, model, doc, key);
      if (!related || !(await matchesWhere(ctx, nestedModel, related, expected))) return false;
      continue;
    }

    const actual = doc[key];
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      const condition = expected as GenericRecord;
      if ("in" in condition && Array.isArray(condition.in)) {
        if (!condition.in.includes(actual)) return false;
      } else if ("startsWith" in condition && typeof condition.startsWith === "string") {
        if (typeof actual !== "string" || !actual.startsWith(condition.startsWith)) return false;
      } else if ("contains" in condition && typeof condition.contains === "string") {
        if (typeof actual !== "string" || !actual.includes(condition.contains)) return false;
      } else if ("not" in condition) {
        if (primitiveEqual(actual, condition.not)) return false;
      } else if ("lte" in condition && typeof actual === "number" && typeof condition.lte === "number") {
        if (actual > condition.lte) return false;
      } else if ("gte" in condition && typeof actual === "number" && typeof condition.gte === "number") {
        if (actual < condition.gte) return false;
      } else {
        if (!primitiveEqual(actual, expected)) return false;
      }
    } else if (!primitiveEqual(actual ?? null, expected ?? null)) {
      return false;
    }
  }
  return true;
}

async function filteredRows(
  ctx: QueryCtx | MutationCtx,
  model: ModelName,
  argsInput: unknown,
): Promise<GenericDoc[]> {
  const args = argsInput && typeof argsInput === "object" ? (argsInput as GenericRecord) : {};
  const where = expandCompoundWhere((args.where ?? {}) as GenericRecord);
  const rows = (await indexedRowsForWhere(ctx, model, where, requestedLimit(args))) ?? (await allDocs(ctx, model));
  const filtered: GenericDoc[] = [];
  for (const row of rows) {
    if (await matchesWhere(ctx, model, row, args.where)) filtered.push(row);
  }
  return sortRows(ctx, model, filtered, args.orderBy);
}

async function indexedRowsForWhere(
  ctx: QueryCtx | MutationCtx,
  model: ModelName,
  where: GenericRecord,
  limit: number,
): Promise<GenericDoc[] | null> {
  const idValue = stringEq(where, "id");
  if (idValue) {
    const row = await firstById(ctx, model, idValue);
    return row ? [row] : [];
  }

  if (model === "entry") {
    const entryType = stringEq(where, "entryType");
    const primarySlug = stringEq(where, "primarySlug");
    if (entryType && primarySlug) {
      return (
        await ctx.db
          .query("entries")
          .withIndex("by_entryType_and_primarySlug", (index) => index.eq("entryType", entryType).eq("primarySlug", primarySlug))
          .take(limit)
      ).map(docRecord);
    }
    const normalizedTitle = stringEq(where, "normalizedTitle");
    if (entryType && normalizedTitle) {
      return (
        await ctx.db
          .query("entries")
          .withIndex("by_entryType_and_normalizedTitle", (index) =>
            index.eq("entryType", entryType).eq("normalizedTitle", normalizedTitle),
          )
          .take(limit)
      ).map(docRecord);
    }
    const status = stringEq(where, "status");
    if (status && entryType) {
      return (
        await ctx.db
          .query("entries")
          .withIndex("by_status_and_entryType_and_updatedAt", (index) => index.eq("status", status).eq("entryType", entryType))
          .take(limit)
      ).map(docRecord);
    }
    if (status) {
      return (
        await ctx.db.query("entries").withIndex("by_status_and_updatedAt", (index) => index.eq("status", status)).take(limit)
      ).map(docRecord);
    }
    return null;
  }

  if (model === "entrySearch") {
    const entryId = stringEq(where, "entryId");
    if (entryId) {
      return (await ctx.db.query("entrySearch").withIndex("by_entryId", (index) => index.eq("entryId", entryId)).take(limit)).map(docRecord);
    }
    const normalizedTitle = stringEq(where, "normalizedTitle");
    if (normalizedTitle) {
      return (
        await ctx.db
          .query("entrySearch")
          .withIndex("by_normalizedTitle", (index) => index.eq("normalizedTitle", normalizedTitle))
          .take(limit)
      ).map(docRecord);
    }
    const entryType = stringEq(where, "entryType");
    if (entryType) {
      return (await ctx.db.query("entrySearch").withIndex("by_entryType", (index) => index.eq("entryType", entryType)).take(limit)).map(docRecord);
    }
    return null;
  }

  if (model === "entryView") {
    const entryId = stringEq(where, "entryId");
    const sessionHash = stringEq(where, "sessionHash");
    if (entryId && sessionHash) {
      return (
        await ctx.db
          .query("entryViews")
          .withIndex("by_entryId_and_sessionHash", (index) => index.eq("entryId", entryId).eq("sessionHash", sessionHash))
          .take(limit)
      ).map(docRecord);
    }
    if (entryId) {
      return (await ctx.db.query("entryViews").withIndex("by_entryId", (index) => index.eq("entryId", entryId)).take(limit)).map(docRecord);
    }
    return null;
  }

  if (model === "entrySlugHistory") {
    const entryType = stringEq(where, "entryType");
    const slug = stringEq(where, "slug");
    if (entryType && slug) {
      return (
        await ctx.db
          .query("entrySlugHistory")
          .withIndex("by_entryType_and_slug", (index) => index.eq("entryType", entryType).eq("slug", slug))
          .take(limit)
      ).map(docRecord);
    }
    const entryId = stringEq(where, "entryId");
    if (entryId) {
      return (
        await ctx.db.query("entrySlugHistory").withIndex("by_entryId", (index) => index.eq("entryId", entryId)).take(limit)
      ).map(docRecord);
    }
    return null;
  }

  if (model === "entryVariant") {
    const entryId = stringEq(where, "entryId");
    if (entryId) {
      return (await ctx.db.query("entryVariants").withIndex("by_entryId", (index) => index.eq("entryId", entryId)).take(limit)).map(docRecord);
    }
    const normalizedVariant = stringEq(where, "normalizedVariant");
    if (normalizedVariant) {
      return (
        await ctx.db
          .query("entryVariants")
          .withIndex("by_normalizedVariant", (index) => index.eq("normalizedVariant", normalizedVariant))
          .take(limit)
      ).map(docRecord);
    }
    return null;
  }

  if (model === "sense") {
    const entryId = stringEq(where, "entryId");
    if (entryId) {
      return (await ctx.db.query("senses").withIndex("by_entryId_and_senseOrder", (index) => index.eq("entryId", entryId)).take(limit)).map(docRecord);
    }
    const status = stringEq(where, "status");
    if (status) return (await ctx.db.query("senses").withIndex("by_status", (index) => index.eq("status", status)).take(limit)).map(docRecord);
    return null;
  }

  if (model === "senseExample") {
    const senseId = stringEq(where, "senseId");
    if (senseId) {
      return (
        await ctx.db.query("senseExamples").withIndex("by_senseId_and_exampleOrder", (index) => index.eq("senseId", senseId)).take(limit)
      ).map(docRecord);
    }
    return null;
  }

  if (model === "tag") {
    const slug = stringEq(where, "slug");
    if (slug) return (await ctx.db.query("tags").withIndex("by_slug", (index) => index.eq("slug", slug)).take(limit)).map(docRecord);
    const name = stringEq(where, "name");
    if (name) return (await ctx.db.query("tags").withIndex("by_name", (index) => index.eq("name", name)).take(limit)).map(docRecord);
    return null;
  }

  if (model === "tagSlugHistory") {
    const slug = stringEq(where, "slug");
    if (slug) return (await ctx.db.query("tagSlugHistory").withIndex("by_slug", (index) => index.eq("slug", slug)).take(limit)).map(docRecord);
    const tagId = stringEq(where, "tagId");
    if (tagId) {
      return (await ctx.db.query("tagSlugHistory").withIndex("by_tagId", (index) => index.eq("tagId", tagId)).take(limit)).map(docRecord);
    }
    return null;
  }

  if (model === "entryTag") {
    const entryId = stringEq(where, "entryId");
    const tagId = stringEq(where, "tagId");
    if (entryId && tagId) {
      return (
        await ctx.db
          .query("entryTags")
          .withIndex("by_entryId_and_tagId", (index) => index.eq("entryId", entryId).eq("tagId", tagId))
          .take(limit)
      ).map(docRecord);
    }
    if (entryId) return (await ctx.db.query("entryTags").withIndex("by_entryId", (index) => index.eq("entryId", entryId)).take(limit)).map(docRecord);
    if (tagId) return (await ctx.db.query("entryTags").withIndex("by_tagId", (index) => index.eq("tagId", tagId)).take(limit)).map(docRecord);
    return null;
  }

  if (model === "entryRelationship") {
    const fromEntryId = stringEq(where, "fromEntryId");
    if (fromEntryId) {
      return (
        await ctx.db.query("entryRelationships").withIndex("by_fromEntryId", (index) => index.eq("fromEntryId", fromEntryId)).take(limit)
      ).map(docRecord);
    }
    const toEntryId = stringEq(where, "toEntryId");
    if (toEntryId) {
      return (
        await ctx.db.query("entryRelationships").withIndex("by_toEntryId", (index) => index.eq("toEntryId", toEntryId)).take(limit)
      ).map(docRecord);
    }
    return null;
  }

  if (model === "source") {
    const sourceSlug = stringEq(where, "sourceSlug");
    if (sourceSlug) {
      return (await ctx.db.query("sources").withIndex("by_sourceSlug", (index) => index.eq("sourceSlug", sourceSlug)).take(limit)).map(docRecord);
    }
    const enabled = booleanEq(where, "enabled");
    if (enabled !== null) {
      return (await ctx.db.query("sources").withIndex("by_enabled", (index) => index.eq("enabled", enabled)).take(limit)).map(docRecord);
    }
    return null;
  }

  if (model === "sourceDocument") {
    const sourceId = stringEq(where, "sourceId");
    const url = stringEq(where, "url");
    if (sourceId && url) {
      return (
        await ctx.db
          .query("sourceDocuments")
          .withIndex("by_sourceId_and_url", (index) => index.eq("sourceId", sourceId).eq("url", url))
          .take(limit)
      ).map(docRecord);
    }
    if (sourceId) {
      return (
        await ctx.db.query("sourceDocuments").withIndex("by_sourceId", (index) => index.eq("sourceId", sourceId)).take(limit)
      ).map(docRecord);
    }
    if (url) return (await ctx.db.query("sourceDocuments").withIndex("by_url", (index) => index.eq("url", url)).take(limit)).map(docRecord);
    return null;
  }

  if (model === "citation") {
    const sourceDocumentId = stringEq(where, "sourceDocumentId");
    if (sourceDocumentId) {
      return (
        await ctx.db.query("citations").withIndex("by_sourceDocumentId", (index) => index.eq("sourceDocumentId", sourceDocumentId)).take(limit)
      ).map(docRecord);
    }
    const sourceId = stringEq(where, "sourceId");
    if (sourceId) return (await ctx.db.query("citations").withIndex("by_sourceId", (index) => index.eq("sourceId", sourceId)).take(limit)).map(docRecord);
    return null;
  }

  if (model === "fieldProvenance") {
    const entityType = stringEq(where, "entityType");
    const entityId = stringEq(where, "entityId");
    if (entityType && entityId) {
      return (
        await ctx.db
          .query("fieldProvenance")
          .withIndex("by_entityType_and_entityId", (index) => index.eq("entityType", entityType).eq("entityId", entityId))
          .take(limit)
      ).map(docRecord);
    }
    const citationId = stringEq(where, "citationId");
    if (citationId) {
      return (
        await ctx.db.query("fieldProvenance").withIndex("by_citationId", (index) => index.eq("citationId", citationId)).take(limit)
      ).map(docRecord);
    }
    return null;
  }

  if (model === "ingestRun") {
    const sourceId = stringEq(where, "sourceId");
    if (sourceId) {
      return (
        await ctx.db.query("ingestRuns").withIndex("by_sourceId_and_startedAt", (index) => index.eq("sourceId", sourceId)).take(limit)
      ).map(docRecord);
    }
    const status = stringEq(where, "status");
    if (status) return (await ctx.db.query("ingestRuns").withIndex("by_status", (index) => index.eq("status", status)).take(limit)).map(docRecord);
    return null;
  }

  if (model === "ingestItem") {
    const ingestRunId = stringEq(where, "ingestRunId");
    const stage = stringEq(where, "stage");
    if (ingestRunId && stage) {
      return (
        await ctx.db
          .query("ingestItems")
          .withIndex("by_ingestRunId_and_stage", (index) => index.eq("ingestRunId", ingestRunId).eq("stage", stage))
          .take(limit)
      ).map(docRecord);
    }
    const sourceDocumentId = stringEq(where, "sourceDocumentId");
    if (sourceDocumentId) {
      return (
        await ctx.db.query("ingestItems").withIndex("by_sourceDocumentId", (index) => index.eq("sourceDocumentId", sourceDocumentId)).take(limit)
      ).map(docRecord);
    }
    return null;
  }

  if (model === "user") {
    const email = stringEq(where, "email");
    if (email) return (await ctx.db.query("users").withIndex("by_email", (index) => index.eq("email", email)).take(limit)).map(docRecord);
    const tokenIdentifier = stringEq(where, "tokenIdentifier");
    if (tokenIdentifier) {
      return (
        await ctx.db.query("users").withIndex("by_tokenIdentifier", (index) => index.eq("tokenIdentifier", tokenIdentifier)).take(limit)
      ).map(docRecord);
    }
    return null;
  }

  if (model === "role") {
    const name = stringEq(where, "name");
    if (name) return (await ctx.db.query("roles").withIndex("by_name", (index) => index.eq("name", name)).take(limit)).map(docRecord);
    return null;
  }

  if (model === "userRole") {
    const userId = stringEq(where, "userId");
    const roleId = stringEq(where, "roleId");
    if (userId && roleId) {
      return (
        await ctx.db.query("userRoles").withIndex("by_userId_and_roleId", (index) => index.eq("userId", userId).eq("roleId", roleId)).take(limit)
      ).map(docRecord);
    }
    if (userId) return (await ctx.db.query("userRoles").withIndex("by_userId", (index) => index.eq("userId", userId)).take(limit)).map(docRecord);
    if (roleId) return (await ctx.db.query("userRoles").withIndex("by_roleId", (index) => index.eq("roleId", roleId)).take(limit)).map(docRecord);
    return null;
  }

  if (model === "takedownCase") {
    const status = stringEq(where, "status");
    if (status) {
      return (await ctx.db.query("takedownCases").withIndex("by_status", (index) => index.eq("status", status)).take(limit)).map(docRecord);
    }
    return null;
  }

  if (model === "rateLimitBucket") {
    const scope = stringEq(where, "scope");
    const key = stringEq(where, "key");
    const windowStart = numberEq(where, "windowStart");
    if (scope && key && windowStart !== null) {
      return (
        await ctx.db
          .query("rateLimitBuckets")
          .withIndex("by_scope_and_key_and_windowStart", (index) =>
            index.eq("scope", scope).eq("key", key).eq("windowStart", windowStart),
          )
          .take(limit)
      ).map(docRecord);
    }
    if (scope) {
      return (await ctx.db.query("rateLimitBuckets").withIndex("by_scope", (index) => index.eq("scope", scope)).take(limit)).map(docRecord);
    }
    return null;
  }

  return null;
}

function direction(value: unknown): SortDirection {
  return value === "desc" ? "desc" : "asc";
}

async function orderValue(
  ctx: QueryCtx | MutationCtx,
  model: ModelName,
  row: GenericDoc,
  order: GenericRecord,
): Promise<unknown> {
  const [field, spec] = Object.entries(order)[0] ?? [];
  if (!field) return null;
  if (spec && typeof spec === "object" && !Array.isArray(spec)) {
    const related = await relatedOne(ctx, model, row, field);
    if (!related) return null;
    const nested = spec as GenericRecord;
    const [nestedField] = Object.keys(nested);
    return nestedField ? related[nestedField] : null;
  }
  return row[field];
}

async function sortRows(
  ctx: QueryCtx | MutationCtx,
  model: ModelName,
  rows: GenericDoc[],
  orderByInput: unknown,
): Promise<GenericDoc[]> {
  const orderBy = Array.isArray(orderByInput) ? orderByInput : orderByInput ? [orderByInput] : [];
  if (!orderBy.length) return rows;
  const decorated = [];
  for (const row of rows) {
    const values = [];
    for (const order of orderBy) values.push(await orderValue(ctx, model, row, order as GenericRecord));
    decorated.push({ row, values });
  }
  decorated.sort((left, right) => {
    for (let i = 0; i < orderBy.length; i += 1) {
      const order = orderBy[i] as GenericRecord;
      const spec = Object.values(order)[0];
      const dir = spec && typeof spec === "object" && !Array.isArray(spec) ? direction(Object.values(spec)[0]) : direction(spec);
      const a = left.values[i];
      const b = right.values[i];
      if (a === b) continue;
      if (a === null || a === undefined) return dir === "asc" ? 1 : -1;
      if (b === null || b === undefined) return dir === "asc" ? -1 : 1;
      return (a < b ? -1 : 1) * (dir === "asc" ? 1 : -1);
    }
    return 0;
  });
  return decorated.map((item) => item.row);
}

function windowRows(rows: GenericDoc[], argsInput: unknown): GenericDoc[] {
  const args = argsInput && typeof argsInput === "object" ? (argsInput as GenericRecord) : {};
  const skip = typeof args.skip === "number" ? Math.max(0, Math.floor(args.skip)) : 0;
  const take = typeof args.take === "number" ? Math.max(0, Math.floor(args.take)) : rows.length;
  return rows.slice(skip, skip + take);
}

async function countRelation(ctx: QueryCtx | MutationCtx, model: ModelName, doc: GenericDoc, relation: string): Promise<number> {
  const rows = await relatedMany(ctx, model, doc, relation);
  return rows?.length ?? 0;
}

async function applyShape(
  ctx: QueryCtx | MutationCtx,
  model: ModelName,
  doc: GenericDoc,
  argsInput: unknown,
): Promise<GenericRecord> {
  const args = argsInput && typeof argsInput === "object" ? (argsInput as GenericRecord) : {};
  const select = args.select && typeof args.select === "object" ? (args.select as GenericRecord) : null;
  const include = args.include && typeof args.include === "object" ? (args.include as GenericRecord) : null;
  const source = select ?? doc;
  const out: GenericRecord = {};

  if (select) {
    for (const [key, spec] of Object.entries(select)) {
      if (spec === true) out[key] = doc[key];
      else if (key === "_count" && spec && typeof spec === "object") {
        out[key] = await applyCount(ctx, model, doc, spec as GenericRecord);
      } else if (spec && typeof spec === "object") {
        out[key] = await shapeRelation(ctx, model, doc, key, spec as GenericRecord);
      }
    }
  } else {
    for (const [key, value] of Object.entries(source as GenericRecord)) {
      if (!key.startsWith("_")) out[key] = value;
    }
  }

  if (include) {
    for (const [key, spec] of Object.entries(include)) {
      if (key === "_count" && spec && typeof spec === "object") {
        out[key] = await applyCount(ctx, model, doc, spec as GenericRecord);
      } else if (spec === true) {
        out[key] = await shapeRelation(ctx, model, doc, key, {});
      } else if (spec && typeof spec === "object") {
        out[key] = await shapeRelation(ctx, model, doc, key, spec as GenericRecord);
      }
    }
  }

  return out;
}

async function applyCount(
  ctx: QueryCtx | MutationCtx,
  model: ModelName,
  doc: GenericDoc,
  spec: GenericRecord,
): Promise<GenericRecord> {
  const select = spec.select && typeof spec.select === "object" ? (spec.select as GenericRecord) : spec;
  const out: GenericRecord = {};
  for (const [relation, enabled] of Object.entries(select)) {
    if (enabled) out[relation] = await countRelation(ctx, model, doc, relation);
  }
  return out;
}

async function shapeRelation(
  ctx: QueryCtx | MutationCtx,
  model: ModelName,
  doc: GenericDoc,
  relation: string,
  spec: GenericRecord,
): Promise<unknown> {
  const many = await relatedMany(ctx, model, doc, relation);
  if (many) {
    const child = childRelation(model, relation);
    const childModel = child?.model;
    if (!childModel) return [];
    const filtered = [];
    for (const row of many) {
      if (await matchesWhere(ctx, childModel, row, spec.where)) filtered.push(row);
    }
    const sorted = await sortRows(ctx, childModel, filtered, spec.orderBy);
    return Promise.all(windowRows(sorted, spec).map((row) => applyShape(ctx, childModel, row, spec)));
  }

  const one = await relatedOne(ctx, model, doc, relation);
  if (!one) return null;
  const target = relationModel(model, relation);
  return target ? applyShape(ctx, target, one, spec) : null;
}

async function findTarget(
  ctx: QueryCtx | MutationCtx,
  model: ModelName,
  where: unknown,
): Promise<GenericDoc | null> {
  const rows = await filteredRows(ctx, model, { where });
  return rows[0] ?? null;
}

async function refreshEntrySearch(ctx: MutationCtx, entryId: string): Promise<void> {
  const entry = await firstById(ctx, "entry", entryId);
  const existing = await findTarget(ctx, "entrySearch", { entryId });
  if (!entry || entry.deletedAt || entry.status !== "PUBLISHED") {
    if (existing) await ctx.db.delete(existing._id as never);
    return;
  }
  const senses = await filteredRows(ctx, "sense", { where: { entryId, status: "PUBLISHED", deletedAt: null } });
  const variants = await filteredRows(ctx, "entryVariant", { where: { entryId } });
  const searchDocument = entrySearchDocument(entry, senses, variants);
  const row = {
    id: entryId,
    entryId,
    entryType: String(entry.entryType),
    normalizedTitle: String(entry.normalizedTitle),
    primarySlug: String(entry.primarySlug),
    searchDocument,
    updatedAt: now(),
  };
  if (existing) await ctx.db.patch(existing._id as never, row as never);
  else await ctx.db.insert("entrySearch", row);
}

function entrySearchDocument(
  entry: GenericDoc,
  senses: GenericDoc[],
  variants: GenericDoc[],
): string {
  return compactEntrySearchDocument([
    entry.displayTitle,
    entry.normalizedTitle,
    entry.primarySlug,
    entry.summaryText,
    ...senses.flatMap((sense) => [sense.senseLabel, sense.expandedForm, sense.definitionText]),
    ...variants.map((variant) => variant.variantText),
  ]);
}

async function refreshForModel(ctx: MutationCtx, model: ModelName, doc: GenericRecord): Promise<void> {
  if (model === "entry" && typeof doc.id === "string") await refreshEntrySearch(ctx, doc.id);
  if ((model === "sense" || model === "entryVariant") && typeof doc.entryId === "string") {
    await refreshEntrySearch(ctx, doc.entryId);
  }
}

export const resolvePublishedEntryBySlug = query({
  args: { entryType: v.string(), slug: v.string() },
  handler: async (ctx, args) => {
    const slug = args.slug.trim().toLowerCase();
    const canonical = await ctx.db
      .query("entries")
      .withIndex("by_entryType_and_primarySlug", (index) => index.eq("entryType", args.entryType).eq("primarySlug", slug))
      .first();
    const canonicalDoc = canonical ? docRecord(canonical) : null;
    if (isPublishedEntry(canonicalDoc)) {
      return { entry: publicEntry(canonicalDoc), canonicalSlug: canonicalDoc.primarySlug, needsRedirect: false };
    }

    const history = await ctx.db
      .query("entrySlugHistory")
      .withIndex("by_entryType_and_slug", (index) => index.eq("entryType", args.entryType).eq("slug", slug))
      .first();
    const historyDoc = history ? docRecord(history) : null;
    if (!historyDoc) return null;
    const entry = await entryById(ctx, String(historyDoc.entryId));
    if (!isPublishedEntry(entry)) return null;
    return { entry: publicEntry(entry), canonicalSlug: entry.primarySlug, needsRedirect: slug !== entry.primarySlug };
  },
});

export const listRecentPublishedEntries = query({
  args: { page: v.number(), pageSize: v.number(), entryType: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const page = Math.max(1, Math.floor(args.page));
    const pageSize = Math.max(1, Math.min(PUBLIC_RECENT_PAGE_SIZE_LIMIT, Math.floor(args.pageSize)));
    const start = (page - 1) * pageSize;
    if (start >= PUBLIC_RECENT_SCAN_LIMIT) return [];
    const target = page * pageSize;
    const entryType = typeof args.entryType === "string" && args.entryType ? args.entryType : null;
    const readLimit = Math.min(PUBLIC_RECENT_SCAN_LIMIT, target + pageSize);
    const rows = entryType
      ? await ctx.db
          .query("entries")
          .withIndex("by_status_and_entryType_and_updatedAt", (index) =>
            index.eq("status", "PUBLISHED").eq("entryType", entryType),
          )
          .order("desc")
          .take(readLimit)
      : await ctx.db
          .query("entries")
          .withIndex("by_status_and_updatedAt", (index) => index.eq("status", "PUBLISHED"))
          .order("desc")
          .take(readLimit);
    return rows
      .map(docRecord)
      .filter((row) => !row.deletedAt)
      .slice(start, target)
      .map(publicEntry);
  },
});

export const listEntryTagsForEntries = query({
  args: { entryIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const out = [];
    for (const entryId of args.entryIds.slice(0, 200)) {
      const links = await ctx.db.query("entryTags").withIndex("by_entryId", (index) => index.eq("entryId", entryId)).take(50);
      for (const link of links.map(docRecord)) {
        const tag = await firstById(ctx, "tag", String(link.tagId));
        if (isLiveTag(tag)) out.push({ entryId, tag: { id: tag.id, name: tag.name, slug: tag.slug } });
      }
    }
    out.sort((left, right) => String(left.tag.name).localeCompare(String(right.tag.name)));
    return out;
  },
});

export const resolveTagBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const slug = args.slug.trim().toLowerCase();
    const tag = await ctx.db.query("tags").withIndex("by_slug", (index) => index.eq("slug", slug)).first();
    const tagDoc = tag ? docRecord(tag) : null;
    if (isLiveTag(tagDoc)) return { tag: publicTag(tagDoc), canonicalSlug: tagDoc.slug, needsRedirect: false };
    const history = await ctx.db.query("tagSlugHistory").withIndex("by_slug", (index) => index.eq("slug", slug)).first();
    const historyDoc = history ? docRecord(history) : null;
    if (!historyDoc) return null;
    const canonical = await firstById(ctx, "tag", String(historyDoc.tagId));
    if (!isLiveTag(canonical)) return null;
    return { tag: publicTag(canonical), canonicalSlug: canonical.slug, needsRedirect: slug !== canonical.slug };
  },
});

export const listTagsWithCounts = query({
  args: {},
  handler: async (ctx) => {
    const tags = (await ctx.db.query("tags").withIndex("by_name").take(PUBLIC_TAG_SCAN_LIMIT))
      .map(docRecord)
      .filter(isLiveTag);
    const result = [];
    for (const tag of tags) {
      const links = await ctx.db
        .query("entryTags")
        .withIndex("by_tagId", (index) => index.eq("tagId", tag.id))
        .take(PUBLIC_TAG_DIRECTORY_COUNT_LIMIT + 1);
      result.push({
        ...publicTag(tag),
        count: Math.min(links.length, PUBLIC_TAG_DIRECTORY_COUNT_LIMIT),
        countIsApproximate: links.length > PUBLIC_TAG_DIRECTORY_COUNT_LIMIT,
      });
    }
    return result;
  },
});

export const listPublishedEntriesForTag = query({
  args: { tagId: v.string(), entryType: v.optional(v.union(v.string(), v.null())), page: v.number(), pageSize: v.number() },
  handler: async (ctx, args) => {
    const page = Math.max(1, Math.floor(args.page));
    const pageSize = Math.max(1, Math.min(200, Math.floor(args.pageSize)));
    const entryType = typeof args.entryType === "string" && args.entryType ? args.entryType : null;
    const links = await ctx.db
      .query("entryTags")
      .withIndex("by_tagId", (index) => index.eq("tagId", args.tagId))
      .take(PUBLIC_TAG_LINK_SCAN_LIMIT);
    const entries = [];
    for (const link of links.map(docRecord)) {
      const entry = await entryById(ctx, String(link.entryId));
      if (isPublishedEntry(entry) && (!entryType || entry.entryType === entryType)) entries.push(entry);
    }
    entries.sort((left, right) => String(left.normalizedTitle).localeCompare(String(right.normalizedTitle)));
    return entries.slice((page - 1) * pageSize, page * pageSize).map(publicEntry);
  },
});

export const getPublicEntryPage = query({
  args: { entryId: v.string(), relationshipLimit: v.number() },
  handler: async (ctx, args) => {
    const entry = await entryById(ctx, args.entryId);
    if (!isPublishedEntry(entry)) return null;

    const variants = (await ctx.db.query("entryVariants").withIndex("by_entryId", (index) => index.eq("entryId", entry.id)).take(100))
      .map(docRecord)
      .sort((left, right) => String(left.variantType).localeCompare(String(right.variantType)) || String(left.variantText).localeCompare(String(right.variantText)))
      .map((variant) => ({ id: variant.id, variantText: variant.variantText, variantType: variant.variantType }));

    const senses = [];
    const senseRows = (await ctx.db.query("senses").withIndex("by_entryId_and_senseOrder", (index) => index.eq("entryId", entry.id)).take(100))
      .map(docRecord)
      .filter((sense) => sense.status === "PUBLISHED" && !sense.deletedAt);
    for (const sense of senseRows) {
      const examples = (await ctx.db.query("senseExamples").withIndex("by_senseId_and_exampleOrder", (index) => index.eq("senseId", sense.id)).take(50))
        .map(docRecord)
        .map((example) => ({ id: example.id, exampleMd: example.exampleMd ?? null, exampleText: example.exampleText ?? null }));
      senses.push({
        id: sense.id,
        senseOrder: sense.senseOrder,
        senseLabel: sense.senseLabel ?? null,
        expandedForm: sense.expandedForm ?? null,
        definitionMd: sense.definitionMd ?? null,
        definitionText: sense.definitionText ?? null,
        examples,
      });
    }

    const entryTags = [];
    const tagLinks = await ctx.db.query("entryTags").withIndex("by_entryId", (index) => index.eq("entryId", entry.id)).take(50);
    for (const link of tagLinks.map(docRecord)) {
      const tag = await firstById(ctx, "tag", String(link.tagId));
      if (isLiveTag(tag)) entryTags.push({ tag: { id: tag.id, name: tag.name, slug: tag.slug } });
    }
    entryTags.sort((left, right) => String(left.tag.name).localeCompare(String(right.tag.name)));

    const provenance = [];
    for (const sense of senseRows) {
      const rows = await ctx.db
        .query("fieldProvenance")
        .withIndex("by_entityType_and_entityId", (index) => index.eq("entityType", "SENSE").eq("entityId", sense.id))
        .take(50);
      for (const row of rows.map(docRecord)) {
        const citation = await firstById(ctx, "citation", String(row.citationId));
        if (!citation) continue;
        const source = await firstById(ctx, "source", String(citation.sourceId));
        const sourceDocument = await firstById(ctx, "sourceDocument", String(citation.sourceDocumentId));
        provenance.push({
          entityId: row.entityId,
          contentMode: row.contentMode,
          extractedAt: row.extractedAt ?? null,
          citation: {
            id: citation.id,
            sourceId: citation.sourceId,
            url: citation.url,
            source: { name: source?.name ?? "" },
            sourceDocument: { title: sourceDocument?.title ?? null },
            licenseNote: citation.licenseNote ?? null,
            attributionText: citation.attributionText ?? null,
            accessedAt: citation.accessedAt ?? null,
          },
        });
      }
    }
    provenance.sort((left, right) => Number(right.extractedAt ?? 0) - Number(left.extractedAt ?? 0));

    const relationships = [];
    const limit = Math.max(1, Math.min(100, Math.floor(args.relationshipLimit)));
    const from = await ctx.db.query("entryRelationships").withIndex("by_fromEntryId", (index) => index.eq("fromEntryId", entry.id)).take(limit);
    const to = await ctx.db.query("entryRelationships").withIndex("by_toEntryId", (index) => index.eq("toEntryId", entry.id)).take(limit);
    for (const row of [...from, ...to].map(docRecord)) {
      if (row.deletedAt) continue;
      const otherId = row.fromEntryId === entry.id ? row.toEntryId : row.fromEntryId;
      const otherEntry = await entryById(ctx, String(otherId));
      if (!isPublishedEntry(otherEntry)) continue;
      relationships.push({
        id: row.id,
        relationshipType: row.relationshipType,
        weight: typeof row.weight === "number" ? row.weight : 0,
        otherEntry: publicEntry(otherEntry),
      });
    }

    const relatedSummaries = [];
    for (const relationship of relationships) {
      const other = await entryById(ctx, String(relationship.otherEntry.id));
      if (isPublishedEntry(other)) {
        relatedSummaries.push({ id: other.id, summaryText: other.summaryText ?? null, summaryMd: other.summaryMd ?? null });
      }
    }

    return {
      entry: { ...publicEntry(entry), displayTitle: entry.displayTitle, summaryMd: entry.summaryMd ?? null, entryTags, variants, senses },
      provenance,
      relationships: relationships.slice(0, limit),
      relatedSummaries,
    };
  },
});

export const loadBrowsePageData = query({
  args: {
    entryType: v.string(),
    letter: v.string(),
    page: v.number(),
    pageSize: v.number(),
    sort: v.string(),
    query: v.string(),
    rawTag: v.string(),
  },
  handler: async (ctx, args) => {
    const activeTag = args.rawTag
      ? await ctx.db.query("tags").withIndex("by_slug", (index) => index.eq("slug", args.rawTag)).first()
      : null;
    const activeTagDoc = activeTag ? docRecord(activeTag) : null;
    const liveActiveTag = isLiveTag(activeTagDoc) ? activeTagDoc : null;
    const page = Math.max(1, Math.floor(args.page));
    const pageSize = Math.max(1, Math.min(200, Math.floor(args.pageSize)));
    const query = args.query.trim().toLowerCase();
    const candidates = [];

    if (liveActiveTag) {
      const links = await ctx.db
        .query("entryTags")
        .withIndex("by_tagId", (index) => index.eq("tagId", liveActiveTag.id))
        .take(PUBLIC_TAG_LINK_SCAN_LIMIT);
      for (const link of links.map(docRecord)) {
        const entry = await entryById(ctx, String(link.entryId));
        if (isPublishedEntry(entry) && entry.entryType === args.entryType) candidates.push(entry);
      }
    } else {
      const prefixStart = args.letter === "0-9" ? "0" : args.letter;
      const prefixEnd = args.letter === "0-9" ? ":" : `${args.letter}\uffff`;
      const rows = await ctx.db
        .query("entries")
        .withIndex("by_entryType_and_normalizedTitle", (index) =>
          index.eq("entryType", args.entryType).gte("normalizedTitle", prefixStart).lt("normalizedTitle", prefixEnd),
        )
        .take(PUBLIC_BROWSE_SCAN_LIMIT);
      for (const row of rows.map(docRecord)) if (isPublishedEntry(row)) candidates.push(row);
    }

    const filtered = candidates.filter((entry) => {
      const first = String(entry.displayTitle ?? "").trim().charAt(0).toLowerCase();
      const letterMatch = args.letter === "0-9" ? /^[0-9]$/.test(first) : first === args.letter;
      if (!letterMatch) return false;
      if (!query) return true;
      return (
        String(entry.normalizedTitle ?? "").toLowerCase().includes(query) ||
        String(entry.displayTitle ?? "").toLowerCase().includes(query) ||
        String(entry.summaryText ?? "").toLowerCase().includes(query)
      );
    });
    filtered.sort((left, right) => {
      if (args.sort === "updated") {
        const updated = Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0);
        if (updated !== 0) return updated;
      }
      return String(left.normalizedTitle).localeCompare(String(right.normalizedTitle));
    });

    const entries = [];
    for (const entry of filtered.slice((page - 1) * pageSize, page * pageSize)) {
      const links = await ctx.db.query("entryTags").withIndex("by_entryId", (index) => index.eq("entryId", entry.id)).take(30);
      const entryTags = [];
      for (const link of links.map(docRecord)) {
        const tag = await firstById(ctx, "tag", String(link.tagId));
        if (isLiveTag(tag)) entryTags.push({ tag: { id: tag.id, name: tag.name, slug: tag.slug } });
      }
      entryTags.sort((left, right) => String(left.tag.name).localeCompare(String(right.tag.name)));
      entries.push({ ...publicEntry(entry), entryTags });
    }

    const topTags = (await ctx.db.query("tags").withIndex("by_name").take(12)).map(docRecord).filter(isLiveTag);
    const tags = topTags.map((tag) => ({ id: tag.id, name: tag.name, slug: tag.slug }));
    if (liveActiveTag && !tags.some((tag) => tag.id === liveActiveTag.id)) {
      tags.unshift({ id: liveActiveTag.id, name: String(liveActiveTag.name), slug: String(liveActiveTag.slug) });
    }
    return {
      activeTag: liveActiveTag ? { id: liveActiveTag.id, name: liveActiveTag.name, slug: liveActiveTag.slug } : null,
      tags,
      entries,
    };
  },
});

export const listPublicSources = query({
  args: {},
  handler: async (ctx) => {
    const sources = await ctx.db
      .query("sources")
      .withIndex("by_enabled", (index) => index.eq("enabled", true))
      .take(PUBLIC_SOURCE_SCAN_LIMIT);
    return sources.map(docRecord).map(publicSource).sort((left, right) => String(left.name).localeCompare(String(right.name)));
  },
});

export const listPublicSourcesWithStats = query({
  args: {},
  handler: async (ctx) => {
    const sources = (
      await ctx.db
        .query("sources")
        .withIndex("by_enabled", (index) => index.eq("enabled", true))
        .take(PUBLIC_SOURCE_SCAN_LIMIT)
    ).map(docRecord);
    const out = [];
    for (const source of sources) {
      const citations = await ctx.db
        .query("citations")
        .withIndex("by_sourceId", (index) => index.eq("sourceId", source.id))
        .take(PUBLIC_SOURCE_DIRECTORY_CITATION_COUNT_LIMIT + 1);
      const latestCitations = await ctx.db
        .query("citations")
        .withIndex("by_sourceId_and_accessedAt", (index) => index.eq("sourceId", source.id))
        .order("desc")
        .take(PUBLIC_SOURCE_DIRECTORY_LATEST_LIMIT);
      let maxAccessedAt: number | null = null;
      for (const citation of latestCitations.map(docRecord)) {
        const accessedAt = typeof citation.accessedAt === "number" ? citation.accessedAt : null;
        if (accessedAt !== null && (maxAccessedAt === null || accessedAt > maxAccessedAt)) maxAccessedAt = accessedAt;
      }
      out.push({
        ...publicSource(source),
        citationCount: Math.min(citations.length, PUBLIC_SOURCE_DIRECTORY_CITATION_COUNT_LIMIT),
        citationCountIsApproximate: citations.length > PUBLIC_SOURCE_DIRECTORY_CITATION_COUNT_LIMIT,
        maxAccessedAt,
      });
    }
    return out.sort((left, right) => String(left.name).localeCompare(String(right.name)));
  },
});

export const resolvePublicSourceBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const source = await ctx.db
      .query("sources")
      .withIndex("by_sourceSlug", (index) => index.eq("sourceSlug", args.slug.trim().toLowerCase()))
      .first();
    const sourceDoc = source ? docRecord(source) : null;
    return sourceDoc && sourceDoc.enabled ? publicSource(sourceDoc) : null;
  },
});

export const listCitedEntriesForSource = query({
  args: { sourceId: v.string(), page: v.number(), pageSize: v.number() },
  handler: async (ctx, args) => {
    const page = Math.max(1, Math.floor(args.page));
    const pageSize = Math.max(1, Math.min(200, Math.floor(args.pageSize)));
    const citations = await ctx.db
      .query("citations")
      .withIndex("by_sourceId", (index) => index.eq("sourceId", args.sourceId))
      .take(PUBLIC_CITATION_SCAN_LIMIT);
    const entryIds = new Set<string>();
    for (const citation of citations.map(docRecord)) {
      const provenances = await ctx.db
        .query("fieldProvenance")
        .withIndex("by_citationId", (index) => index.eq("citationId", citation.id))
        .take(PUBLIC_PROVENANCE_SCAN_LIMIT);
      for (const provenance of provenances.map(docRecord)) {
        if (provenance.entityType !== "SENSE") continue;
        const sense = await firstById(ctx, "sense", String(provenance.entityId));
        if (sense?.status === "PUBLISHED" && !sense.deletedAt && typeof sense.entryId === "string") entryIds.add(sense.entryId);
      }
    }
    const entries = [];
    for (const entryId of entryIds) {
      const entry = await entryById(ctx, entryId);
      if (isPublishedEntry(entry)) entries.push(entry);
    }
    entries.sort((left, right) => String(left.normalizedTitle).localeCompare(String(right.normalizedTitle)));
    return {
      count: entries.length,
      entries: entries.slice((page - 1) * pageSize, page * pageSize).map(publicEntry),
    };
  },
});

export const listSitemapEntries = query({
  args: { entryType: v.string() },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("entries")
      .withIndex("by_entryType_and_normalizedTitle", (index) => index.eq("entryType", args.entryType))
      .take(SITEMAP_SCAN_LIMIT);
    return entries
      .map(docRecord)
      .filter(isPublishedEntry)
      .map((entry) => ({ primarySlug: entry.primarySlug, updatedAt: entry.updatedAt ?? null }));
  },
});

export const listSitemapTags = query({
  args: {},
  handler: async (ctx) =>
    (await ctx.db.query("tags").withIndex("by_slug").take(SITEMAP_SCAN_LIMIT))
      .map(docRecord)
      .filter(isLiveTag)
      .map((tag) => ({ slug: tag.slug, updatedAt: tag.updatedAt ?? null })),
});

export const listSitemapSources = query({
  args: {},
  handler: async (ctx) =>
    (
      await ctx.db
        .query("sources")
        .withIndex("by_enabled", (index) => index.eq("enabled", true))
        .take(SITEMAP_SCAN_LIMIT)
    )
      .map(docRecord)
      .map((source) => ({ sourceSlug: source.sourceSlug, updatedAt: source.updatedAt ?? null })),
});

// Internal: this reports audit-event, ingest-run and source-document volumes
// plus sample row IDs. Its only caller is scripts/convex-retention-dry-run.mjs,
// which runs it through `npx convex run` on deploy-key credentials.
export const auditRetentionDryRun = internalQuery({
  args: {
    olderThanDays: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cutoff = now() - Math.max(1, Math.floor(args.olderThanDays)) * 24 * 60 * 60 * 1000;
    const limit = Math.max(1, Math.min(ADMIN_DRY_RUN_SCAN_LIMIT, Math.floor(args.limit ?? 100)));
    const oldAuditEvents = (await ctx.db.query("auditEvents").withIndex("by_createdAt", (index) => index.lt("createdAt", cutoff)).take(limit))
      .map(docRecord);
    const oldIngestRuns = (await ctx.db
      .query("ingestRuns")
      .withIndex("by_status_and_finishedAt", (index) => index.eq("status", "COMPLETED").lt("finishedAt", cutoff))
      .take(limit)
    ).map(docRecord);
    const oldSourceDocuments = (await ctx.db.query("sourceDocuments").withIndex("by_fetchedAt", (index) => index.lt("fetchedAt", cutoff)).take(limit))
      .map(docRecord)
      .filter((row) => !row.doNotUse);
    return {
      cutoff,
      scannedLimit: limit,
      candidates: {
        auditEvents: oldAuditEvents.length,
        completedIngestRuns: oldIngestRuns.length,
        sourceDocuments: oldSourceDocuments.length,
      },
      sampleIds: {
        auditEvents: oldAuditEvents.slice(0, 20).map((row) => row.id),
        completedIngestRuns: oldIngestRuns.slice(0, 20).map((row) => row.id),
        sourceDocuments: oldSourceDocuments.slice(0, 20).map((row) => row.id),
      },
    };
  },
});

export const cleanupAuditEventsBatch = internalMutation({
  args: {
    olderThanDays: v.number(),
    dryRun: v.boolean(),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cutoff = now() - Math.max(1, Math.floor(args.olderThanDays)) * 24 * 60 * 60 * 1000;
    const limit = Math.max(1, Math.min(500, Math.floor(args.batchSize ?? 250)));
    const rows = await ctx.db
      .query("auditEvents")
      .withIndex("by_createdAt", (index) => index.lt("createdAt", cutoff))
      .take(limit);
    if (!args.dryRun) {
      for (const row of rows) await ctx.db.delete(row._id);
    }
    return {
      cutoff,
      dryRun: args.dryRun,
      batchSize: limit,
      candidates: rows.length,
      deleted: args.dryRun ? 0 : rows.length,
      maybeMore: rows.length === limit,
    };
  },
});

export const hitRateLimit = mutation({
  args: { scope: v.string(), key: v.string(), windowStart: v.number() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("rateLimitBuckets")
      .withIndex("by_scope_and_key_and_windowStart", (index) =>
        index.eq("scope", args.scope).eq("key", args.key).eq("windowStart", args.windowStart),
      )
      .first();
    const existingDoc = existing ? docRecord(existing) : null;
    const timestamp = now();
    if (existingDoc) {
      const count = Number(existingDoc.count ?? 0) + 1;
      await ctx.db.patch(existingDoc._id as never, { count, updatedAt: timestamp } as never);
      return { count };
    }
    await ctx.db.insert("rateLimitBuckets", {
      id: id(),
      scope: args.scope,
      key: args.key,
      windowStart: args.windowStart,
      count: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return { count: 1 };
  },
});

export const trackPublishedEntryView = mutation({
  args: { entryId: v.string(), sessionHash: v.string(), nowMs: v.number(), minIntervalMs: v.number() },
  handler: async (ctx, args) => {
    const entry = await entryById(ctx, args.entryId);
    if (!isPublishedEntry(entry)) return { tracked: false, reason: "entry_not_found" };
    const existing = await ctx.db
      .query("entryViews")
      .withIndex("by_entryId_and_sessionHash", (index) => index.eq("entryId", args.entryId).eq("sessionHash", args.sessionHash))
      .first();
    const existingDoc = existing ? docRecord(existing) : null;
    if (existingDoc && Number(existingDoc.lastSeenAt ?? 0) > args.nowMs - args.minIntervalMs) {
      return { tracked: false, reason: "duplicate" };
    }
    if (existingDoc) {
      await ctx.db.patch(existingDoc._id as never, { lastSeenAt: args.nowMs } as never);
      return { tracked: true, reason: "updated" };
    }
    await ctx.db.insert("entryViews", {
      id: id(),
      entryId: args.entryId,
      sessionHash: args.sessionHash,
      firstSeenAt: args.nowMs,
      lastSeenAt: args.nowMs,
    });
    return { tracked: true, reason: "created" };
  },
});

export const findMany = query({
  args: { model: v.string(), args: v.optional(v.any()), adminKey: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    await requireAdminForGenericRead(ctx, args.adminKey);
    const model = asModel(args.model);
    const rows = windowRows(await filteredRows(ctx, model, args.args), args.args);
    return Promise.all(rows.map((row) => applyShape(ctx, model, row, args.args)));
  },
});

export const findFirst = query({
  args: { model: v.string(), args: v.optional(v.any()), adminKey: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    await requireAdminForGenericRead(ctx, args.adminKey);
    const model = asModel(args.model);
    const rows = windowRows(await filteredRows(ctx, model, { ...(args.args ?? {}), take: 1 }), { ...(args.args ?? {}), take: 1 });
    return rows[0] ? applyShape(ctx, model, rows[0], args.args) : null;
  },
});

export const count = query({
  args: { model: v.string(), args: v.optional(v.any()), adminKey: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    await requireAdminForGenericRead(ctx, args.adminKey);
    return (await filteredRows(ctx, asModel(args.model), args.args)).length;
  },
});

export const groupBy = query({
  args: { model: v.string(), args: v.optional(v.any()), adminKey: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    await requireAdminForGenericRead(ctx, args.adminKey);
    const model = asModel(args.model);
    const input = args.args && typeof args.args === "object" ? (args.args as GenericRecord) : {};
    const by = Array.isArray(input.by) ? input.by.filter((field): field is string => typeof field === "string") : [];
    const rows = await filteredRows(ctx, model, input);
    const groups = new Map<string, { keys: GenericRecord; rows: GenericDoc[] }>();
    for (const row of rows) {
      const keys = Object.fromEntries(by.map((field) => [field, row[field]]));
      const groupKey = JSON.stringify(keys);
      const existing = groups.get(groupKey) ?? { keys, rows: [] };
      existing.rows.push(row);
      groups.set(groupKey, existing);
    }
    const result = Array.from(groups.values()).map((group) => {
      const out: GenericRecord = { ...group.keys };
      if (input._count && typeof input._count === "object") {
        const counts: GenericRecord = {};
        for (const field of Object.keys(input._count as GenericRecord)) counts[field] = group.rows.length;
        out._count = counts;
      }
      if (input._max && typeof input._max === "object") {
        const maxes: GenericRecord = {};
        for (const field of Object.keys(input._max as GenericRecord)) {
          maxes[field] = group.rows.reduce<unknown>((max, row) => {
            const value = row[field];
            if (max === null || max === undefined) return value;
            if (value === null || value === undefined) return max;
            return value > max ? value : max;
          }, null);
        }
        out._max = maxes;
      }
      return out;
    });
    return windowRows(result.map((row) => ({ ...row, id: JSON.stringify(row), _id: "", _creationTime: 0 })), input).map(
      ({ id: _id, _creationTime, ...row }) => row,
    );
  },
});

export const create = mutation({
  args: { model: v.string(), args: v.any(), adminKey: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    await requireAdminForGenericWrite(ctx, args.adminKey);
    const model = asModel(args.model);
    const input = args.args && typeof args.args === "object" ? (args.args as GenericRecord) : {};
    const data = normalizeData(input.data ?? {}) as GenericRecord;
    const timestamp = now();
    const row = {
      id: typeof data.id === "string" ? data.id : id(),
      createdAt: data.createdAt ?? timestamp,
      updatedAt: data.updatedAt ?? timestamp,
      ...data,
    };
    await ctx.db.insert(tableFor(model), row as never);
    await refreshForModel(ctx, model, row);
    const created = await findTarget(ctx, model, { id: row.id });
    return created ? applyShape(ctx, model, created, input) : row;
  },
});

export const createMany = mutation({
  args: { model: v.string(), args: v.any(), adminKey: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    await requireAdminForGenericWrite(ctx, args.adminKey);
    const model = asModel(args.model);
    const input = args.args && typeof args.args === "object" ? (args.args as GenericRecord) : {};
    const rawRows = Array.isArray(input.data) ? input.data : [];
    let countInserted = 0;
    for (const raw of rawRows) {
      const data = normalizeData(raw) as GenericRecord;
      const timestamp = now();
      const row = {
        id: typeof data.id === "string" ? data.id : id(),
        createdAt: data.createdAt ?? timestamp,
        updatedAt: data.updatedAt ?? timestamp,
        ...data,
      };
      const existing = await findTarget(ctx, model, { id: row.id });
      if (existing && input.skipDuplicates) continue;
      await ctx.db.insert(tableFor(model), row as never);
      await refreshForModel(ctx, model, row);
      countInserted += 1;
    }
    return { count: countInserted };
  },
});

export const update = mutation({
  args: { model: v.string(), args: v.any(), adminKey: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    await requireAdminForGenericWrite(ctx, args.adminKey);
    const model = asModel(args.model);
    const input = args.args && typeof args.args === "object" ? (args.args as GenericRecord) : {};
    const target = await findTarget(ctx, model, input.where);
    if (!target) throw new Error(`${model} not found`);
    const data = normalizeUpdateData(input.data ?? {}, target);
    const patch = { ...data, updatedAt: data.updatedAt ?? now() };
    await ctx.db.patch(target._id as never, patch as never);
    const updated = await firstById(ctx, model, target.id);
    if (updated) await refreshForModel(ctx, model, updated);
    return updated ? applyShape(ctx, model, updated, input) : null;
  },
});

export const updateMany = mutation({
  args: { model: v.string(), args: v.any(), adminKey: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    await requireAdminForGenericWrite(ctx, args.adminKey);
    const model = asModel(args.model);
    const input = args.args && typeof args.args === "object" ? (args.args as GenericRecord) : {};
    const rows = await filteredRows(ctx, model, input);
    let countUpdated = 0;
    for (const row of rows) {
      const data = normalizeUpdateData(input.data ?? {}, row);
      const patch = { ...data, updatedAt: data.updatedAt ?? now() };
      await ctx.db.patch(row._id as never, patch as never);
      await refreshForModel(ctx, model, { ...row, ...patch });
      countUpdated += 1;
    }
    return { count: countUpdated };
  },
});

export const deleteMany = mutation({
  args: { model: v.string(), args: v.any(), adminKey: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    await requireAdminForGenericWrite(ctx, args.adminKey);
    const model = asModel(args.model);
    const rows = await filteredRows(ctx, model, args.args);
    for (const row of rows) await ctx.db.delete(row._id as never);
    return { count: rows.length };
  },
});

export const upsert = mutation({
  args: { model: v.string(), args: v.any(), adminKey: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    await requireAdminForGenericWrite(ctx, args.adminKey);
    const model = asModel(args.model);
    const input = args.args && typeof args.args === "object" ? (args.args as GenericRecord) : {};
    const existing = await findTarget(ctx, model, input.where);
    if (existing) {
      const patch = { ...normalizeUpdateData(input.update ?? {}, existing), updatedAt: now() };
      await ctx.db.patch(existing._id as never, patch as never);
      const updated = await firstById(ctx, model, existing.id);
      if (updated) await refreshForModel(ctx, model, updated);
      return updated ? applyShape(ctx, model, updated, input) : null;
    }
    const data = normalizeData(input.create ?? {}) as GenericRecord;
    const timestamp = now();
    const row = {
      id: typeof data.id === "string" ? data.id : id(),
      createdAt: data.createdAt ?? timestamp,
      updatedAt: data.updatedAt ?? timestamp,
      ...expandCompoundWhere((input.where ?? {}) as GenericRecord),
      ...data,
    };
    await ctx.db.insert(tableFor(model), row as never);
    await refreshForModel(ctx, model, row);
    const created = await findTarget(ctx, model, { id: row.id });
    return created ? applyShape(ctx, model, created, input) : row;
  },
});

export const searchPublishedEntries = query({
  args: {
    query: v.string(),
    entryType: v.optional(v.union(v.string(), v.null())),
    tagSlug: v.optional(v.union(v.string(), v.null())),
    page: v.number(),
    pageSize: v.number(),
  },
  handler: async (ctx, args) => {
    const raw = args.query.trim().slice(0, 120);
    if (!raw) return [];
    const q = raw.toLowerCase().replace(/\s+/g, " ");
    if (q.length <= 1 || ["a", "an", "and", "or", "the"].includes(q)) return [];
    const slug = q.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const page = Math.max(1, Math.min(10, Math.floor(args.page)));
    const pageSize = Math.max(1, Math.min(50, Math.floor(args.pageSize)));
    const entryType = typeof args.entryType === "string" && args.entryType ? args.entryType : null;
    const tagSlug = typeof args.tagSlug === "string" && args.tagSlug ? args.tagSlug : null;
    const candidateLimit = Math.min(200, Math.max(page * pageSize * 3, pageSize + 40));
    const candidates = new Map<string, GenericDoc>();
    const addSearchRows = (rows: unknown[]) => {
      for (const row of rows) {
        const search = docRecord(row);
        const entryId = typeof search.entryId === "string" ? search.entryId : String(search.id);
        if (!candidates.has(entryId)) candidates.set(entryId, search);
      }
    };

    addSearchRows(
      await ctx.db
        .query("entrySearch")
        .withIndex("by_normalizedTitle", (index) => index.gte("normalizedTitle", q).lt("normalizedTitle", `${q}\uffff`))
        .take(candidateLimit),
    );
    const shouldSearchFullText = q.includes(" ") || q.length >= 4;
    if (shouldSearchFullText) {
      addSearchRows(
        await ctx.db
          .query("entrySearch")
          .withSearchIndex("search_searchDocument", (search) =>
            entryType ? search.search("searchDocument", raw).eq("entryType", entryType) : search.search("searchDocument", raw),
          )
          .take(candidateLimit),
      );
    }
    if (slug) {
      for (const type of entryType ? [entryType] : ["TERM", "ACRONYM"]) {
        const entryBySlug = await ctx.db
          .query("entries")
          .withIndex("by_entryType_and_primarySlug", (index) => index.eq("entryType", type).eq("primarySlug", slug))
          .first();
        if (!entryBySlug) continue;
        addSearchRows(
          await ctx.db
            .query("entrySearch")
            .withIndex("by_entryId", (index) => index.eq("entryId", docRecord(entryBySlug).id))
            .take(1),
        );
      }
    }

    let tagId: string | null = null;
    if (tagSlug) {
      const tag = await ctx.db
        .query("tags")
        .withIndex("by_slug", (index) => index.eq("slug", tagSlug))
        .first();
      const tagDoc = tag ? docRecord(tag) : null;
      if (!tagDoc || tagDoc.deletedAt) return [];
      tagId = String(tagDoc.id);
    }

    const terms = q.split(" ").filter((term) => term && !["a", "an", "and", "or", "the"].includes(term));
    const matches = [];
    for (const search of candidates.values()) {
      if (entryType && search.entryType !== entryType) continue;
      const entry = await firstById(ctx, "entry", String(search.entryId));
      if (!entry || entry.status !== "PUBLISHED" || entry.deletedAt) continue;
      if (tagId) {
        const link = await ctx.db
          .query("entryTags")
          .withIndex("by_entryId_and_tagId", (index) => index.eq("entryId", entry.id).eq("tagId", tagId))
          .first();
        if (!link) continue;
      }
      const title = String(search.normalizedTitle ?? "").toLowerCase();
      const primarySlug = String(search.primarySlug ?? "").toLowerCase();
      const doc = String(search.searchDocument ?? "").toLowerCase();
      const docIndex = doc.indexOf(q);
      const firstTermIndex = terms.map((term) => doc.indexOf(term)).filter((index) => index >= 0).sort((left, right) => left - right)[0] ?? -1;
      const docMatches = docIndex >= 0 || (terms.length > 0 && terms.every((term) => doc.includes(term)));
      const snippetIndex = docIndex >= 0 ? docIndex : firstTermIndex;
      let bucket = 0;
      let score = 0;
      if (title === q || primarySlug === slug) {
        bucket = 1;
        score = 1000;
      } else if (title.startsWith(q) || primarySlug.startsWith(slug)) {
        bucket = 2;
        score = 800;
      } else if (docMatches) {
        bucket = 3;
        score = 400 + (snippetIndex >= 0 ? Math.max(0, 100 - snippetIndex) : 0);
      } else {
        continue;
      }
      const senses =
        entry.entryType === "ACRONYM"
          ? (await ctx.db
              .query("senses")
              .withIndex("by_entryId_and_senseOrder", (index) => index.eq("entryId", entry.id))
              .take(50)
            )
              .map(docRecord)
              .filter((sense) => sense.status === "PUBLISHED" && !sense.deletedAt)
          : [];
      matches.push({
        id: entry.id,
        entryType: entry.entryType,
        displayTitle: entry.displayTitle,
        primarySlug: entry.primarySlug,
        summaryText: entry.summaryText ?? null,
        snippet: snippetIndex >= 0 ? String(search.searchDocument).slice(Math.max(0, snippetIndex - 60), snippetIndex + 160) : null,
        senseCount: entry.entryType === "ACRONYM" ? senses.length : null,
        senseSummary:
          entry.entryType === "ACRONYM"
            ? senses
                .slice(0, 3)
                .map((sense) => String(sense.senseLabel ?? sense.expandedForm ?? "").trim())
                .filter(Boolean)
                .join(" · ") || null
            : null,
        bucket,
        score,
      });
    }
    matches.sort((left, right) => left.bucket - right.bucket || right.score - left.score || String(left.displayTitle).localeCompare(String(right.displayTitle)));
    return matches.slice((page - 1) * pageSize, page * pageSize);
  },
});

export const rebuildSearchIndex = mutation({
  args: {
    adminKey: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    await requireAdminForGenericWrite(ctx, args.adminKey);
    const entries = await filteredRows(ctx, "entry", { where: { status: "PUBLISHED", deletedAt: null } });
    for (const entry of entries) await refreshEntrySearch(ctx, entry.id);
    return { rebuilt: entries.length };
  },
});

export const compactEntrySearchBatch = internalMutation({
  args: {
    paginationOpts: paginationOptsValidator,
    dryRun: v.boolean(),
  },
  handler: async (ctx, args) => {
    const paginationOpts = {
      ...args.paginationOpts,
      numItems: Math.max(
        1,
        Math.min(SEARCH_COMPACTION_BATCH_LIMIT, Math.floor(args.paginationOpts.numItems)),
      ),
    };
    const result = await ctx.db.query("entrySearch").withIndex("by_normalizedTitle").paginate(paginationOpts);
    let compacted = 0;
    let charsBefore = 0;
    let charsAfter = 0;

    for (const row of result.page) {
      const entryId = typeof row.entryId === "string" ? row.entryId : row.id;
      const entry = await firstById(ctx, "entry", entryId);
      const senses = entry ? await filteredRows(ctx, "sense", { where: { entryId, status: "PUBLISHED", deletedAt: null } }) : [];
      const variants = entry ? await filteredRows(ctx, "entryVariant", { where: { entryId } }) : [];
      const next = entry ? entrySearchDocument(entry, senses, variants) : compactEntrySearchDocument([
        row.normalizedTitle,
        row.primarySlug,
        row.searchDocument,
      ]);
      charsBefore += row.searchDocument.length;
      charsAfter += next.length;
      if (next === row.searchDocument) continue;
      compacted += 1;
      if (!args.dryRun) await ctx.db.patch(row._id, { searchDocument: next, updatedAt: now() });
    }

    return {
      dryRun: args.dryRun,
      scanned: result.page.length,
      compacted,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      charsBefore,
      charsAfter,
      maxChars: MAX_ENTRY_SEARCH_DOCUMENT_CHARS,
    };
  },
});

export const pruneRateLimitBuckets = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = now() - 24 * 60 * 60 * 1000;
    const rows = await ctx.db
      .query("rateLimitBuckets")
      .withIndex("by_windowStart", (index) => index.lt("windowStart", cutoff))
      .take(RATE_LIMIT_PRUNE_BATCH_LIMIT);
    for (const row of rows) await ctx.db.delete(row._id);
    return { deleted: rows.length };
  },
});
