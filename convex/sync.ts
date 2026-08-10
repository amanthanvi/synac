import { v, type Infer } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { internal } from './_generated/api';
import { stablePayloadHash } from './lib/contentGeneration';
import {
  citationValidator,
  entryType,
  exampleValidator,
  relationshipType,
} from './schema';

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

const tagRedirectRow = v.object({
  fromSlug: v.string(),
  toSlug: v.optional(v.string()),
});

const generationCountsValidator = v.object({
  sources: v.number(),
  tags: v.number(),
  entries: v.number(),
  senses: v.number(),
  entryTags: v.number(),
  entrySources: v.number(),
  relationships: v.number(),
  redirects: v.number(),
  tagRedirects: v.number(),
});

type GenerationCounts = Infer<typeof generationCountsValidator>;
type PendingGeneration = NonNullable<Doc<'syncMeta'>['pending']>;

const COUNT_KEYS: Array<keyof GenerationCounts> = [
  'sources',
  'tags',
  'entries',
  'senses',
  'entryTags',
  'entrySources',
  'relationships',
  'redirects',
  'tagRedirects',
];

const EMPTY_COUNTS: GenerationCounts = {
  sources: 0,
  tags: 0,
  entries: 0,
  senses: 0,
  entryTags: 0,
  entrySources: 0,
  relationships: 0,
  redirects: 0,
  tagRedirects: 0,
};

const MAX_BATCHES = 1_000;

const batchEnvelope = {
  syncVersion: v.string(),
  manifestHash: v.string(),
  ordinal: v.number(),
  batchHash: v.string(),
};

async function contentMeta(ctx: MutationCtx) {
  return await ctx.db
    .query('syncMeta')
    .withIndex('by_key', (q) => q.eq('key', 'content'))
    .unique();
}

function sameCounts(
  actual: GenerationCounts,
  expected: GenerationCounts,
): boolean {
  return COUNT_KEYS.every((key) => actual[key] === expected[key]);
}

function sameRecord(
  actual: Record<string, number>,
  expected: Record<string, number>,
): boolean {
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every(
      (key, index) =>
        key === expectedKeys[index] && actual[key] === expected[key],
    )
  );
}

function assertNonnegativeRecord(
  name: string,
  values: Record<string, number>,
): void {
  for (const [key, value] of Object.entries(values)) {
    if (!key || !Number.isSafeInteger(value) || value < 0) {
      throw new Error(
        `${name}.${key || '<empty>'} must be a non-negative integer`,
      );
    }
  }
}

function assertCounts(counts: GenerationCounts): void {
  for (const key of COUNT_KEYS) {
    if (!Number.isSafeInteger(counts[key]) || counts[key] < 0) {
      throw new Error(`expectedCounts.${key} must be a non-negative integer`);
    }
  }
}

export const begin = internalMutation({
  args: {
    syncVersion: v.string(),
    manifestHash: v.string(),
    batchHashes: v.array(v.string()),
    expectedCounts: generationCountsValidator,
    expectedTagCounts: v.record(v.string(), v.number()),
    expectedSourceCounts: v.record(v.string(), v.number()),
  },
  handler: async (ctx, args) => {
    assertCounts(args.expectedCounts);
    assertNonnegativeRecord('expectedTagCounts', args.expectedTagCounts);
    assertNonnegativeRecord('expectedSourceCounts', args.expectedSourceCounts);
    if (args.batchHashes.length === 0)
      throw new Error('sync manifest must contain at least one batch');
    if (args.batchHashes.length > MAX_BATCHES) {
      throw new Error(
        `sync manifest exceeds the ${MAX_BATCHES}-batch safety limit`,
      );
    }
    if (
      Object.keys(args.expectedTagCounts).length !== args.expectedCounts.tags
    ) {
      throw new Error(
        'expectedTagCounts keys must match the expected tags count',
      );
    }
    if (
      Object.keys(args.expectedSourceCounts).length !==
      args.expectedCounts.sources
    ) {
      throw new Error(
        'expectedSourceCounts keys must match the expected sources count',
      );
    }
    const computedManifestHash = await stablePayloadHash({
      syncVersion: args.syncVersion,
      batchHashes: args.batchHashes,
      expectedCounts: args.expectedCounts,
      expectedTagCounts: args.expectedTagCounts,
      expectedSourceCounts: args.expectedSourceCounts,
    });
    if (computedManifestHash !== args.manifestHash)
      throw new Error('sync manifest hash mismatch');

    const existing = await contentMeta(ctx);
    if (existing?.contentVersion === args.syncVersion && !existing.pending) {
      return {
        alreadyCurrent: true,
        nextBatchOrdinal: args.batchHashes.length,
      };
    }
    if (existing?.pending) {
      if (
        existing.pending.syncVersion === args.syncVersion &&
        existing.pending.manifestHash === args.manifestHash &&
        existing.pending.state === 'STAGING'
      ) {
        return {
          alreadyCurrent: false,
          nextBatchOrdinal: existing.pending.nextBatchOrdinal,
        };
      }
      throw new Error(
        `another content generation is pending (${existing.pending.syncVersion}, ${existing.pending.state})`,
      );
    }
    if (existing?.prunePending)
      throw new Error(
        'cannot begin a sync while stale-generation pruning is pending',
      );

    const pending: PendingGeneration = {
      state: 'STAGING',
      syncVersion: args.syncVersion,
      manifestHash: args.manifestHash,
      batchHashes: args.batchHashes,
      nextBatchOrdinal: 0,
      expectedCounts: args.expectedCounts,
      observedCounts: { ...EMPTY_COUNTS },
      expectedTagCounts: args.expectedTagCounts,
      observedTagCounts: Object.fromEntries(
        Object.keys(args.expectedTagCounts).map((slug) => [slug, 0]),
      ),
      expectedSourceCounts: args.expectedSourceCounts,
      observedSourceCounts: Object.fromEntries(
        Object.keys(args.expectedSourceCounts).map((slug) => [slug, 0]),
      ),
    };
    if (existing) {
      await ctx.db.patch(existing._id, { pending });
    } else {
      await ctx.db.insert('syncMeta', {
        key: 'content',
        contentVersion: '',
        syncedAt: 0,
        entryCount: 0,
        formatVersion: 2,
        prunePending: false,
        pending,
      });
    }
    return { alreadyCurrent: false, nextBatchOrdinal: 0 };
  },
});

type BatchIdentity = {
  syncVersion: string;
  manifestHash: string;
  ordinal: number;
  batchHash: string;
};

async function verifyBatch(
  ctx: MutationCtx,
  args: BatchIdentity,
  kind: string,
  rows: unknown,
): Promise<
  | { retry: true }
  | { retry: false; meta: Doc<'syncMeta'>; pending: PendingGeneration }
> {
  const meta = await contentMeta(ctx);
  const pending = meta?.pending;
  if (!meta || !pending || pending.state !== 'STAGING')
    throw new Error('no staging generation is active');
  if (
    pending.syncVersion !== args.syncVersion ||
    pending.manifestHash !== args.manifestHash
  ) {
    throw new Error('batch does not belong to the pending generation');
  }
  if (
    pending.lastBatchOrdinal === args.ordinal &&
    pending.lastBatchHash === args.batchHash &&
    pending.nextBatchOrdinal === args.ordinal + 1
  ) {
    return { retry: true };
  }
  if (args.ordinal !== pending.nextBatchOrdinal) {
    throw new Error(
      `batch ordinal ${args.ordinal} is out of order; expected ${pending.nextBatchOrdinal}`,
    );
  }
  if (pending.batchHashes[args.ordinal] !== args.batchHash)
    throw new Error('batch hash is not in the manifest');
  const actualHash = await stablePayloadHash({ kind, rows });
  if (actualHash !== args.batchHash)
    throw new Error('batch payload hash mismatch');
  return { retry: false, meta, pending };
}

function incrementRecord(
  observed: Record<string, number>,
  expected: Record<string, number>,
  additions: Record<string, number>,
  name: string,
): Record<string, number> {
  const next = { ...observed };
  for (const [key, amount] of Object.entries(additions)) {
    if (expected[key] === undefined)
      throw new Error(`${name} contains unknown key ${key}`);
    next[key] = (next[key] ?? 0) + amount;
    if (next[key] > expected[key])
      throw new Error(`${name}.${key} exceeds the manifest count`);
  }
  return next;
}

async function finishBatch(
  ctx: MutationCtx,
  meta: Doc<'syncMeta'>,
  pending: PendingGeneration,
  args: BatchIdentity,
  additions: Partial<GenerationCounts>,
  tagAdditions: Record<string, number> = {},
  sourceAdditions: Record<string, number> = {},
): Promise<void> {
  const observedCounts = { ...pending.observedCounts };
  for (const key of COUNT_KEYS) {
    observedCounts[key] += additions[key] ?? 0;
    if (observedCounts[key] > pending.expectedCounts[key]) {
      throw new Error(`observed ${key} exceeds the manifest count`);
    }
  }
  await ctx.db.patch(meta._id, {
    pending: {
      ...pending,
      observedCounts,
      observedTagCounts: incrementRecord(
        pending.observedTagCounts,
        pending.expectedTagCounts,
        tagAdditions,
        'observedTagCounts',
      ),
      observedSourceCounts: incrementRecord(
        pending.observedSourceCounts,
        pending.expectedSourceCounts,
        sourceAdditions,
        'observedSourceCounts',
      ),
      nextBatchOrdinal: args.ordinal + 1,
      lastBatchOrdinal: args.ordinal,
      lastBatchHash: args.batchHash,
    },
  });
}

export const upsertSources = internalMutation({
  args: { ...batchEnvelope, rows: v.array(sourceRow) },
  handler: async (ctx, args) => {
    const verified = await verifyBatch(ctx, args, 'sources', args.rows);
    if (verified.retry) return { applied: false };
    for (const row of args.rows) {
      const existing = await ctx.db
        .query('sources')
        .withIndex('by_syncVersion_and_slug', (q) =>
          q.eq('syncVersion', args.syncVersion).eq('slug', row.slug),
        )
        .unique();
      const expectedCount = verified.pending.expectedSourceCounts[row.slug];
      if (expectedCount === undefined)
        throw new Error(`staged source ${row.slug} is not in the manifest`);
      if (row.citedEntryCount !== expectedCount) {
        throw new Error(
          `staged source ${row.slug} declares ${row.citedEntryCount}; expected ${expectedCount}`,
        );
      }
      if (existing) throw new Error(`duplicate staged source ${row.slug}`);
      await ctx.db.insert('sources', { ...row, syncVersion: args.syncVersion });
    }
    await finishBatch(ctx, verified.meta, verified.pending, args, {
      sources: args.rows.length,
    });
    return { applied: true };
  },
});

export const upsertTags = internalMutation({
  args: { ...batchEnvelope, rows: v.array(tagRow) },
  handler: async (ctx, args) => {
    const verified = await verifyBatch(ctx, args, 'tags', args.rows);
    if (verified.retry) return { applied: false };
    for (const row of args.rows) {
      const existing = await ctx.db
        .query('tags')
        .withIndex('by_syncVersion_and_slug', (q) =>
          q.eq('syncVersion', args.syncVersion).eq('slug', row.slug),
        )
        .unique();
      const expectedCount = verified.pending.expectedTagCounts[row.slug];
      if (expectedCount === undefined)
        throw new Error(`staged tag ${row.slug} is not in the manifest`);
      if (row.entryCount !== expectedCount) {
        throw new Error(
          `staged tag ${row.slug} declares ${row.entryCount}; expected ${expectedCount}`,
        );
      }
      if (existing) throw new Error(`duplicate staged tag ${row.slug}`);
      await ctx.db.insert('tags', { ...row, syncVersion: args.syncVersion });
    }
    await finishBatch(ctx, verified.meta, verified.pending, args, {
      tags: args.rows.length,
    });
    return { applied: true };
  },
});

export const upsertEntries = internalMutation({
  args: { ...batchEnvelope, rows: v.array(entryRow) },
  handler: async (ctx, args) => {
    const verified = await verifyBatch(ctx, args, 'entries', args.rows);
    if (verified.retry) return { applied: false };
    let senseCount = 0;
    let entryTagCount = 0;
    let entrySourceCount = 0;
    const tagAdditions: Record<string, number> = {};
    const sourceAdditions: Record<string, number> = {};
    for (const row of args.rows) {
      const existing = await ctx.db
        .query('entries')
        .withIndex('by_syncVersion_and_key', (q) =>
          q.eq('syncVersion', args.syncVersion).eq('key', row.key),
        )
        .unique();
      if (existing) throw new Error(`duplicate staged entry ${row.key}`);
      const { senses, ...entryFields } = row;
      const entryId = await ctx.db.insert('entries', {
        ...entryFields,
        syncVersion: args.syncVersion,
      });

      const seenSenseKeys = new Set<string>();
      for (const sense of senses) {
        if (seenSenseKeys.has(sense.key))
          throw new Error(`duplicate staged sense ${row.key}/${sense.key}`);
        seenSenseKeys.add(sense.key);
        await ctx.db.insert('senses', {
          ...sense,
          entryId,
          entryKey: row.key,
          syncVersion: args.syncVersion,
        });
        senseCount += 1;
      }

      const seenTagSlugs = new Set<string>();
      for (const tagSlug of row.tagSlugs) {
        if (seenTagSlugs.has(tagSlug))
          throw new Error(`duplicate staged entry tag ${row.key}/${tagSlug}`);
        seenTagSlugs.add(tagSlug);
        await ctx.db.insert('entryTags', {
          entryId,
          entryKey: row.key,
          tagSlug,
          entryType: row.entryType,
          updatedAt: row.updatedAt,
          syncVersion: args.syncVersion,
        });
        entryTagCount += 1;
        tagAdditions[tagSlug] = (tagAdditions[tagSlug] ?? 0) + 1;
      }

      const seenSourceSlugs = new Set<string>();
      for (const sourceSlug of row.citedSourceSlugs) {
        if (seenSourceSlugs.has(sourceSlug)) {
          throw new Error(
            `duplicate staged entry source ${row.key}/${sourceSlug}`,
          );
        }
        seenSourceSlugs.add(sourceSlug);
        await ctx.db.insert('entrySources', {
          entryId,
          entryKey: row.key,
          sourceSlug,
          normalizedTitle: row.normalizedTitle,
          syncVersion: args.syncVersion,
        });
        entrySourceCount += 1;
        sourceAdditions[sourceSlug] = (sourceAdditions[sourceSlug] ?? 0) + 1;
      }
    }
    await finishBatch(
      ctx,
      verified.meta,
      verified.pending,
      args,
      {
        entries: args.rows.length,
        senses: senseCount,
        entryTags: entryTagCount,
        entrySources: entrySourceCount,
      },
      tagAdditions,
      sourceAdditions,
    );
    return { applied: true };
  },
});

export const upsertRelationships = internalMutation({
  args: { ...batchEnvelope, rows: v.array(relationshipRow) },
  handler: async (ctx, args) => {
    const verified = await verifyBatch(ctx, args, 'relationships', args.rows);
    if (verified.retry) return { applied: false };
    for (const row of args.rows) {
      const from = await ctx.db
        .query('entries')
        .withIndex('by_syncVersion_and_key', (q) =>
          q.eq('syncVersion', args.syncVersion).eq('key', row.fromKey),
        )
        .unique();
      const to = await ctx.db
        .query('entries')
        .withIndex('by_syncVersion_and_key', (q) =>
          q.eq('syncVersion', args.syncVersion).eq('key', row.toKey),
        )
        .unique();
      if (!from || !to)
        throw new Error(
          `relationship endpoints missing: ${row.fromKey} -> ${row.toKey}`,
        );
      const existing = await ctx.db
        .query('relationships')
        .withIndex('by_syncVersion_and_fromKey_and_toKey_and_type', (q) =>
          q
            .eq('syncVersion', args.syncVersion)
            .eq('fromKey', row.fromKey)
            .eq('toKey', row.toKey)
            .eq('type', row.type),
        )
        .unique();
      if (existing)
        throw new Error(
          `duplicate staged relationship ${row.fromKey}/${row.toKey}/${row.type}`,
        );
      await ctx.db.insert('relationships', {
        ...row,
        fromEntryId: from._id,
        toEntryId: to._id,
        syncVersion: args.syncVersion,
      });
    }
    await finishBatch(ctx, verified.meta, verified.pending, args, {
      relationships: args.rows.length,
    });
    return { applied: true };
  },
});

export const upsertRedirects = internalMutation({
  args: { ...batchEnvelope, rows: v.array(redirectRow) },
  handler: async (ctx, args) => {
    const verified = await verifyBatch(ctx, args, 'redirects', args.rows);
    if (verified.retry) return { applied: false };
    for (const row of args.rows) {
      const existing = await ctx.db
        .query('redirects')
        .withIndex('by_syncVersion_and_entryType_and_fromSlug', (q) =>
          q
            .eq('syncVersion', args.syncVersion)
            .eq('entryType', row.entryType)
            .eq('fromSlug', row.fromSlug),
        )
        .unique();
      if (existing)
        throw new Error(
          `duplicate staged redirect ${row.entryType}/${row.fromSlug}`,
        );
      await ctx.db.insert('redirects', {
        ...row,
        syncVersion: args.syncVersion,
      });
    }
    await finishBatch(ctx, verified.meta, verified.pending, args, {
      redirects: args.rows.length,
    });
    return { applied: true };
  },
});

export const upsertTagRedirects = internalMutation({
  args: { ...batchEnvelope, rows: v.array(tagRedirectRow) },
  handler: async (ctx, args) => {
    const verified = await verifyBatch(ctx, args, 'tagRedirects', args.rows);
    if (verified.retry) return { applied: false };
    for (const row of args.rows) {
      const existing = await ctx.db
        .query('tagRedirects')
        .withIndex('by_syncVersion_and_fromSlug', (q) =>
          q.eq('syncVersion', args.syncVersion).eq('fromSlug', row.fromSlug),
        )
        .unique();
      if (existing)
        throw new Error(`duplicate staged tag redirect ${row.fromSlug}`);
      await ctx.db.insert('tagRedirects', {
        ...row,
        syncVersion: args.syncVersion,
      });
    }
    await finishBatch(ctx, verified.meta, verified.pending, args, {
      tagRedirects: args.rows.length,
    });
    return { applied: true };
  },
});

const PRUNE_TABLES = [
  'sources',
  'tags',
  'entries',
  'senses',
  'entryTags',
  'entrySources',
  'relationships',
  'redirects',
  'tagRedirects',
] as const;

const PRUNE_BATCH = 200;

export const commit = internalMutation({
  args: { syncVersion: v.string(), manifestHash: v.string() },
  handler: async (ctx, args) => {
    const meta = await contentMeta(ctx);
    const pending = meta?.pending;
    if (!meta || !pending || pending.state !== 'STAGING')
      throw new Error('no staging generation is active');
    if (
      pending.syncVersion !== args.syncVersion ||
      pending.manifestHash !== args.manifestHash
    ) {
      throw new Error('commit does not match the pending generation');
    }
    if (pending.nextBatchOrdinal !== pending.batchHashes.length) {
      throw new Error(
        `cannot commit: received ${pending.nextBatchOrdinal}/${pending.batchHashes.length} batches`,
      );
    }
    if (!sameCounts(pending.observedCounts, pending.expectedCounts)) {
      throw new Error(
        'cannot commit: observed table counts do not match the manifest',
      );
    }
    if (!sameRecord(pending.observedTagCounts, pending.expectedTagCounts)) {
      throw new Error(
        'cannot commit: observed tag counts do not match the manifest',
      );
    }
    if (
      !sameRecord(pending.observedSourceCounts, pending.expectedSourceCounts)
    ) {
      throw new Error(
        'cannot commit: observed source counts do not match the manifest',
      );
    }
    const needsPrune = Boolean(meta.contentVersion);
    await ctx.db.patch(meta._id, {
      contentVersion: args.syncVersion,
      syncedAt: Date.now(),
      entryCount: pending.expectedCounts.entries,
      formatVersion: 2,
      prunePending: needsPrune,
      pending: undefined,
    });
    if (needsPrune) {
      await ctx.scheduler.runAfter(0, internal.sync.pruneBatch, {
        syncVersion: args.syncVersion,
      });
    }
    return null;
  },
});

export const abortPending = internalMutation({
  args: { syncVersion: v.string() },
  handler: async (ctx, args) => {
    const meta = await contentMeta(ctx);
    const pending = meta?.pending;
    if (!meta || !pending) return { aborting: false };
    if (pending.syncVersion !== args.syncVersion)
      throw new Error('abort version does not match pending generation');
    if (pending.syncVersion === meta.contentVersion)
      throw new Error('cannot abort the active generation');
    await ctx.db.patch(meta._id, {
      pending: { ...pending, state: 'ABORTING' },
    });
    await ctx.scheduler.runAfter(0, internal.sync.abortPendingBatch, {
      syncVersion: args.syncVersion,
    });
    return { aborting: true };
  },
});

export const abortPendingBatch = internalMutation({
  args: { syncVersion: v.string() },
  handler: async (ctx, args) => {
    const meta = await contentMeta(ctx);
    const pending = meta?.pending;
    if (
      !meta ||
      !pending ||
      pending.syncVersion !== args.syncVersion ||
      pending.state !== 'ABORTING'
    ) {
      return { deleted: 0 };
    }
    let deleted = 0;
    for (const table of PRUNE_TABLES) {
      if (deleted >= PRUNE_BATCH) break;
      const rows = await ctx.db
        .query(table)
        .withIndex('by_syncVersion', (q) =>
          q.eq('syncVersion', args.syncVersion),
        )
        .take(PRUNE_BATCH - deleted);
      for (const row of rows) {
        await ctx.db.delete(row._id);
        deleted += 1;
      }
    }
    if (deleted >= PRUNE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.sync.abortPendingBatch, {
        syncVersion: args.syncVersion,
      });
    } else {
      await ctx.db.patch(meta._id, { pending: undefined });
    }
    return { deleted };
  },
});

export const pruneBatch = internalMutation({
  args: { syncVersion: v.string() },
  handler: async (ctx, args) => {
    const current = await contentMeta(ctx);
    if (current?.contentVersion !== args.syncVersion) return { deleted: 0 };

    let deleted = 0;
    for (const table of PRUNE_TABLES) {
      if (deleted >= PRUNE_BATCH) break;
      const remaining = PRUNE_BATCH - deleted;
      const below = await ctx.db
        .query(table)
        .withIndex('by_syncVersion', (q) =>
          q.lt('syncVersion', args.syncVersion),
        )
        .take(remaining);
      const above = await ctx.db
        .query(table)
        .withIndex('by_syncVersion', (q) =>
          q.gt('syncVersion', args.syncVersion),
        )
        .take(Math.max(0, remaining - below.length));
      for (const row of [...below, ...above]) {
        await ctx.db.delete(row._id);
        deleted += 1;
      }
    }
    if (deleted >= PRUNE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.sync.pruneBatch, {
        syncVersion: args.syncVersion,
      });
    } else {
      await ctx.db.patch(current._id, { prunePending: false });
    }
    return { deleted };
  },
});

export const status = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query('syncMeta')
      .withIndex('by_key', (q) => q.eq('key', 'content'))
      .unique();
  },
});
