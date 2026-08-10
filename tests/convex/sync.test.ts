import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { api, internal } from '../../convex/_generated/api';
import schema from '../../convex/schema';
import { syncPayloadHash } from '../../tools/content/src/sync-plan';
import { makeEntryRow, modules, seedDataset, stageDataset } from './helpers';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

async function runScheduled(t: ReturnType<typeof convexTest>) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

const emptyGeneration = {
  tags: [{ slug: 'malware', name: 'Malware', entryCount: 0 }],
  sources: [],
  entries: [makeEntryRow({ tagSlugs: [], citedSourceSlugs: [] })],
  relationships: [],
  redirects: [],
  tagRedirects: [],
};

describe('atomic content sync', () => {
  test('rejects forged manifest key sets and oversized manifests', async () => {
    const t = convexTest(schema, modules);
    const expectedCounts = {
      sources: 0,
      tags: 2,
      entries: 0,
      senses: 0,
      entryTags: 0,
      entrySources: 0,
      relationships: 0,
      redirects: 0,
      tagRedirects: 0,
    };
    const batchHashes = ['0'.repeat(64)];
    const expectedTagCounts = { malware: 0 };
    const expectedSourceCounts = {};
    const manifestHash = syncPayloadHash({
      syncVersion: 'forged',
      batchHashes,
      expectedCounts,
      expectedTagCounts,
      expectedSourceCounts,
    });
    await expect(
      t.mutation(internal.sync.begin, {
        syncVersion: 'forged',
        manifestHash,
        batchHashes,
        expectedCounts,
        expectedTagCounts,
        expectedSourceCounts,
      }),
    ).rejects.toThrow(/expectedTagCounts keys/);

    const tooManyHashes = Array.from({ length: 1_001 }, () => '0'.repeat(64));
    const emptyCounts = { ...expectedCounts, tags: 0 };
    const oversizedHash = syncPayloadHash({
      syncVersion: 'oversized',
      batchHashes: tooManyHashes,
      expectedCounts: emptyCounts,
      expectedTagCounts: {},
      expectedSourceCounts: {},
    });
    await expect(
      t.mutation(internal.sync.begin, {
        syncVersion: 'oversized',
        manifestHash: oversizedHash,
        batchHashes: tooManyHashes,
        expectedCounts: emptyCounts,
        expectedTagCounts: {},
        expectedSourceCounts: {},
      }),
    ).rejects.toThrow(/1000-batch safety limit/);
  });

  test('binds staged tag and source rows to manifest keys and counts', async () => {
    const t = convexTest(schema, modules);
    const tagRows = [{ slug: 'malware', name: 'Malware', entryCount: 1 }];
    const sourceRows = [
      {
        slug: 'rfc4949',
        name: 'RFC 4949',
        baseUrl: 'https://www.rfc-editor.org/rfc/rfc4949.txt',
        licenseType: 'OTHER',
        allowedUse: 'Reproduce with attribution',
        attributionRequirements: 'RFC 4949, IETF',
        trustTier: 'TIER1',
        enabled: true,
        lastVerifiedAt: Date.parse('2026-01-15T00:00:00Z'),
        citedEntryCount: 1,
      },
    ];
    const batches = [
      { kind: 'sources', rows: sourceRows },
      { kind: 'tags', rows: tagRows },
    ];
    const batchHashes = batches.map(syncPayloadHash);
    const expectedCounts = {
      sources: 1,
      tags: 1,
      entries: 0,
      senses: 0,
      entryTags: 0,
      entrySources: 0,
      relationships: 0,
      redirects: 0,
      tagRedirects: 0,
    };
    const expectedTagCounts = { bogus: 1 };
    const expectedSourceCounts = { rfc4949: 0 };
    const manifestHash = syncPayloadHash({
      syncVersion: 'mismatch',
      batchHashes,
      expectedCounts,
      expectedTagCounts,
      expectedSourceCounts,
    });
    await t.mutation(internal.sync.begin, {
      syncVersion: 'mismatch',
      manifestHash,
      batchHashes,
      expectedCounts,
      expectedTagCounts,
      expectedSourceCounts,
    });
    await expect(
      t.mutation(internal.sync.upsertSources, {
        syncVersion: 'mismatch',
        manifestHash,
        ordinal: 0,
        batchHash: batchHashes[0] ?? '',
        rows: sourceRows,
      }),
    ).rejects.toThrow(/declares 1; expected 0/);

    const matchingSourceCounts = { rfc4949: 1 };
    const retryManifestHash = syncPayloadHash({
      syncVersion: 'tag-mismatch',
      batchHashes,
      expectedCounts,
      expectedTagCounts,
      expectedSourceCounts: matchingSourceCounts,
    });
    const second = convexTest(schema, modules);
    await second.mutation(internal.sync.begin, {
      syncVersion: 'tag-mismatch',
      manifestHash: retryManifestHash,
      batchHashes,
      expectedCounts,
      expectedTagCounts,
      expectedSourceCounts: matchingSourceCounts,
    });
    await second.mutation(internal.sync.upsertSources, {
      syncVersion: 'tag-mismatch',
      manifestHash: retryManifestHash,
      ordinal: 0,
      batchHash: batchHashes[0] ?? '',
      rows: sourceRows,
    });
    await expect(
      second.mutation(internal.sync.upsertTags, {
        syncVersion: 'tag-mismatch',
        manifestHash: retryManifestHash,
        ordinal: 1,
        batchHash: batchHashes[1] ?? '',
        rows: tagRows,
      }),
    ).rejects.toThrow(/not in the manifest/);
  });

  test('re-running the active manifest is idempotent', async () => {
    const t = convexTest(schema, modules);
    await seedDataset(t, 'v1');
    const before = await t.run(async (ctx) => ({
      entries: await ctx.db.query('entries').collect(),
      senses: await ctx.db.query('senses').collect(),
    }));
    await seedDataset(t, 'v1');
    const after = await t.run(async (ctx) => ({
      entries: await ctx.db.query('entries').collect(),
      senses: await ctx.db.query('senses').collect(),
    }));
    expect(after.entries.map((entry) => entry._id).sort()).toEqual(
      before.entries.map((entry) => entry._id).sort(),
    );
    expect(after.senses.map((sense) => sense._id).sort()).toEqual(
      before.senses.map((sense) => sense._id).sort(),
    );
  });

  test('resuming a pending manifest preserves its staging start time', async () => {
    const t = convexTest(schema, modules);
    vi.setSystemTime(new Date('2026-08-10T00:00:00Z'));
    await stageDataset(t, 'v1', { stageBatchCount: 0, commit: false });
    const startedAt = (await t.query(internal.sync.status, {}))?.pending
      ?.startedAt;
    expect(startedAt).toBe(Date.parse('2026-08-10T00:00:00Z'));

    vi.setSystemTime(new Date('2026-08-10T01:00:00Z'));
    await stageDataset(t, 'v1', { stageBatchCount: 0, commit: false });
    expect((await t.query(internal.sync.status, {}))?.pending?.startedAt).toBe(
      startedAt,
    );
  });

  test('fixture staging rejects an invalid batch count before beginning', async () => {
    const t = convexTest(schema, modules);
    await expect(
      stageDataset(t, 'v1', { stageBatchCount: 7, commit: false }),
    ).rejects.toThrow(/stageBatchCount must be an integer from 0 through 6/);
    expect(await t.query(internal.sync.status, {})).toBeNull();
  });

  test('partial staging leaves the complete active generation visible', async () => {
    const t = convexTest(schema, modules);
    await seedDataset(t, 'v1');
    await stageDataset(t, 'v2', {
      entries: [
        makeEntryRow({
          title: 'Staged Back Door',
          searchDocument: 'staged back door',
        }),
      ],
      sources: [
        {
          slug: 'rfc4949',
          name: 'RFC 4949',
          baseUrl: 'https://www.rfc-editor.org/rfc/rfc4949.txt',
          licenseType: 'OTHER',
          allowedUse: 'Reproduce with attribution',
          attributionRequirements: 'RFC 4949, IETF',
          trustTier: 'TIER1',
          enabled: true,
          lastVerifiedAt: Date.parse('2026-01-15T00:00:00Z'),
          citedEntryCount: 1,
        },
      ],
      relationships: [],
      redirects: [],
      tagRedirects: [],
      stageBatchCount: 3,
      commit: false,
    });

    const page = await t.query(api.publicEntries.getEntryPage, {
      entryType: 'TERM',
      slug: 'back-door',
    });
    expect(page?.entry.title).toBe('Back Door');
    expect(await t.query(api.tags.directory, {})).toEqual([
      { slug: 'malware', name: 'Malware', description: null, entryCount: 1 },
    ]);
    expect(
      (await t.query(api.sources.list, {})).map((source) => source.slug),
    ).toEqual(['rfc4949']);
    expect(
      await t.query(api.search.search, {
        query: 'staged back',
        page: 1,
        pageSize: 20,
      }),
    ).toEqual([]);
    expect(
      await t.query(api.sitemap.entrySlugsPage, {
        entryType: 'TERM',
        paginationOpts: { numItems: 10, cursor: null },
        expectedVersion: 'v1',
      }),
    ).toMatchObject({ contentVersion: 'v1', generationChanged: false });
    const status = await t.query(internal.sync.status, {});
    expect(status?.contentVersion).toBe('v1');
    expect(status?.pending?.syncVersion).toBe('v2');
    const rows = await t.run(
      async (ctx) => await ctx.db.query('entries').collect(),
    );
    expect(rows.some((row) => row.syncVersion === 'v1')).toBe(true);
    expect(rows.some((row) => row.syncVersion === 'v2')).toBe(true);
  });

  test('commit rejects an incomplete manifest and preserves active content', async () => {
    const t = convexTest(schema, modules);
    await seedDataset(t, 'v1');
    const plan = await stageDataset(t, 'v2', {
      stageBatchCount: 2,
      commit: false,
    });
    await expect(
      t.mutation(internal.sync.commit, {
        syncVersion: 'v2',
        manifestHash: plan.manifestHash,
      }),
    ).rejects.toThrow(/received 2\/6 batches/);
    expect((await t.query(internal.sync.status, {}))?.contentVersion).toBe(
      'v1',
    );
  });

  test('wrong and out-of-order batches do not change pending progress', async () => {
    const t = convexTest(schema, modules);
    await seedDataset(t, 'v1');
    const plan = await stageDataset(t, 'v2', {
      stageBatchCount: 2,
      commit: false,
    });
    await expect(
      t.mutation(internal.sync.upsertEntries, {
        syncVersion: 'v2',
        manifestHash: plan.manifestHash,
        ordinal: 2,
        batchHash: '0'.repeat(64),
        rows: [makeEntryRow()],
      }),
    ).rejects.toThrow(/not in the manifest/);
    await expect(
      t.mutation(internal.sync.upsertRelationships, {
        syncVersion: 'v2',
        manifestHash: plan.manifestHash,
        ordinal: 3,
        batchHash: plan.batchHashes[3] ?? '',
        rows: [
          { fromKey: 'TERM:back-door', toKey: 'ACRONYM:ids', type: 'RELATED' },
        ],
      }),
    ).rejects.toThrow(/out of order/);
    expect(
      (await t.query(internal.sync.status, {}))?.pending?.nextBatchOrdinal,
    ).toBe(2);
    const stagedEntries = await t.run(
      async (ctx) =>
        await ctx.db
          .query('entries')
          .withIndex('by_syncVersion', (q) => q.eq('syncVersion', 'v2'))
          .collect(),
    );
    expect(stagedEntries).toHaveLength(0);
  });

  test('retrying the last committed batch is an idempotent no-op', async () => {
    const t = convexTest(schema, modules);
    await seedDataset(t, 'v1');
    const entry = makeEntryRow();
    const plan = await stageDataset(t, 'v2', {
      entries: [entry],
      sources: [
        {
          slug: 'rfc4949',
          name: 'RFC 4949',
          baseUrl: 'https://www.rfc-editor.org/rfc/rfc4949.txt',
          licenseType: 'OTHER',
          allowedUse: 'Reproduce with attribution',
          attributionRequirements: 'RFC 4949, IETF',
          trustTier: 'TIER1',
          enabled: true,
          lastVerifiedAt: Date.parse('2026-01-15T00:00:00Z'),
          citedEntryCount: 1,
        },
      ],
      relationships: [],
      redirects: [],
      tagRedirects: [],
      stageBatchCount: 3,
      commit: false,
    });
    expect(
      await t.mutation(internal.sync.upsertEntries, {
        syncVersion: 'v2',
        manifestHash: plan.manifestHash,
        ordinal: 2,
        batchHash: plan.batchHashes[2] ?? '',
        rows: [entry],
      }),
    ).toEqual({ applied: false });
    const stagedEntries = await t.run(
      async (ctx) =>
        await ctx.db
          .query('entries')
          .withIndex('by_syncVersion', (q) => q.eq('syncVersion', 'v2'))
          .collect(),
    );
    expect(stagedEntries).toHaveLength(1);
  });

  test('entry batches bind the declared sense count to staged senses', async () => {
    const t = convexTest(schema, modules);
    const entry = makeEntryRow({ senseCount: 2 });
    const plan = await stageDataset(t, 'v1', {
      entries: [entry],
      sources: [
        {
          slug: 'rfc4949',
          name: 'RFC 4949',
          baseUrl: 'https://www.rfc-editor.org/rfc/rfc4949.txt',
          licenseType: 'OTHER',
          allowedUse: 'Reproduce with attribution',
          attributionRequirements: 'RFC 4949, IETF',
          trustTier: 'TIER1',
          enabled: true,
          lastVerifiedAt: Date.parse('2026-01-15T00:00:00Z'),
          citedEntryCount: 1,
        },
      ],
      relationships: [],
      redirects: [],
      tagRedirects: [],
      stageBatchCount: 2,
      commit: false,
    });

    await expect(
      t.mutation(internal.sync.upsertEntries, {
        syncVersion: 'v1',
        manifestHash: plan.manifestHash,
        ordinal: 2,
        batchHash: plan.batchHashes[2] ?? '',
        rows: [entry],
      }),
    ).rejects.toThrow(/declares 2 senses; received 1/);
    expect(
      (await t.query(internal.sync.status, {}))?.pending?.nextBatchOrdinal,
    ).toBe(2);
  });

  test('table, tag, and source count mismatches block activation', async () => {
    const t = convexTest(schema, modules);
    await seedDataset(t, 'v1');
    const plan = await stageDataset(t, 'v2', {
      tags: [{ slug: 'malware', name: 'Malware', entryCount: 2 }],
      sources: [
        {
          slug: 'rfc4949',
          name: 'RFC 4949',
          baseUrl: 'https://www.rfc-editor.org/rfc/rfc4949.txt',
          licenseType: 'OTHER',
          allowedUse: 'Reproduce with attribution',
          attributionRequirements: 'RFC 4949, IETF',
          trustTier: 'TIER1',
          enabled: true,
          lastVerifiedAt: Date.parse('2026-01-15T00:00:00Z'),
          citedEntryCount: 2,
        },
      ],
      entries: [makeEntryRow()],
      relationships: [],
      redirects: [],
      tagRedirects: [],
      commit: false,
    });
    await expect(
      t.mutation(internal.sync.commit, {
        syncVersion: 'v2',
        manifestHash: plan.manifestHash,
      }),
    ).rejects.toThrow(/tag counts/);
    expect((await t.query(internal.sync.status, {}))?.contentVersion).toBe(
      'v1',
    );
  });

  test('a complete commit atomically switches reads before physical pruning', async () => {
    const t = convexTest(schema, modules);
    await seedDataset(t, 'v1');
    await stageDataset(t, 'v2', emptyGeneration);

    expect((await t.query(internal.sync.status, {}))?.contentVersion).toBe(
      'v2',
    );
    expect(
      await t.query(api.publicEntries.resolveBySlug, {
        entryType: 'ACRONYM',
        slug: 'ids',
      }),
    ).toBeNull();
    expect(
      await t.query(api.tags.resolveSlug, { slug: 'old-malware' }),
    ).toBeNull();
    const physicalBeforePrune = await t.run(
      async (ctx) => await ctx.db.query('entries').collect(),
    );
    expect(physicalBeforePrune.some((row) => row.syncVersion === 'v1')).toBe(
      true,
    );
    expect(physicalBeforePrune.some((row) => row.syncVersion === 'v2')).toBe(
      true,
    );

    await runScheduled(t);
    const rows = await t.run(async (ctx) => ({
      entries: await ctx.db.query('entries').collect(),
      senses: await ctx.db.query('senses').collect(),
      relationships: await ctx.db.query('relationships').collect(),
      redirects: await ctx.db.query('redirects').collect(),
      entryTags: await ctx.db.query('entryTags').collect(),
      tagRedirects: await ctx.db.query('tagRedirects').collect(),
      sources: await ctx.db.query('sources').collect(),
    }));
    expect(rows.entries.map((entry) => entry.key)).toEqual(['TERM:back-door']);
    expect(rows.senses.map((sense) => sense.entryKey)).toEqual([
      'TERM:back-door',
    ]);
    expect(rows.relationships).toHaveLength(0);
    expect(rows.redirects).toHaveLength(0);
    expect(rows.entryTags).toHaveLength(0);
    expect(rows.tagRedirects).toHaveLength(0);
    expect(rows.sources).toHaveLength(0);
    expect((await t.query(internal.sync.status, {}))?.prunePending).toBe(false);
  });

  test('sitemap pagination detects an active-generation flip', async () => {
    const t = convexTest(schema, modules);
    await seedDataset(t, 'v1');
    const first = await t.query(api.sitemap.entrySlugsPage, {
      entryType: 'TERM',
      paginationOpts: { numItems: 1, cursor: null },
      expectedVersion: null,
    });
    expect(first.contentVersion).toBe('v1');
    await stageDataset(t, 'v2', emptyGeneration);
    const changed = await t.query(api.sitemap.entrySlugsPage, {
      entryType: 'TERM',
      paginationOpts: { numItems: 1, cursor: first.continueCursor },
      expectedVersion: first.contentVersion,
    });
    expect(changed).toMatchObject({
      contentVersion: 'v2',
      generationChanged: true,
      page: [],
    });
  });

  test('aborting a partial generation preserves active rows and removes staged rows', async () => {
    const t = convexTest(schema, modules);
    await seedDataset(t, 'v1');
    await stageDataset(t, 'v2', { stageBatchCount: 3, commit: false });
    await t.mutation(internal.sync.abortPending, { syncVersion: 'v2' });
    await runScheduled(t);
    const status = await t.query(internal.sync.status, {});
    expect(status?.contentVersion).toBe('v1');
    expect(status?.pending).toBeUndefined();
    const staged = await t.run(
      async (ctx) =>
        await ctx.db
          .query('entries')
          .withIndex('by_syncVersion', (q) => q.eq('syncVersion', 'v2'))
          .collect(),
    );
    expect(staged).toHaveLength(0);
    expect(
      (
        await t.query(api.publicEntries.getEntryPage, {
          entryType: 'TERM',
          slug: 'back-door',
        })
      )?.entry.title,
    ).toBe('Back Door');
  });

  test('commit cannot race an aborting generation', async () => {
    const t = convexTest(schema, modules);
    await seedDataset(t, 'v1');
    const plan = await stageDataset(t, 'v2', {
      stageBatchCount: 3,
      commit: false,
    });
    await t.mutation(internal.sync.abortPending, { syncVersion: 'v2' });
    await expect(
      t.mutation(internal.sync.commit, {
        syncVersion: 'v2',
        manifestHash: plan.manifestHash,
      }),
    ).rejects.toThrow(/no staging generation/);
    expect((await t.query(internal.sync.status, {}))?.contentVersion).toBe(
      'v1',
    );
  });

  test('abort rejects a mismatched version without changing pending state', async () => {
    const t = convexTest(schema, modules);
    await seedDataset(t, 'v1');
    await stageDataset(t, 'v2', { stageBatchCount: 3, commit: false });

    await expect(
      t.mutation(internal.sync.abortPending, { syncVersion: 'v3' }),
    ).rejects.toThrow(/abort version does not match/);
    expect((await t.query(internal.sync.status, {}))?.pending).toMatchObject({
      state: 'STAGING',
      syncVersion: 'v2',
      nextBatchOrdinal: 3,
    });
  });

  test('a new generation cannot begin while pruning is pending', async () => {
    const t = convexTest(schema, modules);
    await seedDataset(t, 'v1');
    await t.run(async (ctx) => {
      const meta = await ctx.db
        .query('syncMeta')
        .withIndex('by_key', (q) => q.eq('key', 'content'))
        .unique();
      if (!meta) throw new Error('sync metadata missing');
      await ctx.db.patch(meta._id, { prunePending: true });
    });

    await expect(
      stageDataset(t, 'v2', { stageBatchCount: 0, commit: false }),
    ).rejects.toThrow(/pruning is pending/);
    expect((await t.query(internal.sync.status, {}))?.contentVersion).toBe(
      'v1',
    );
  });

  test('a different manifest cannot replace an active staging generation', async () => {
    const t = convexTest(schema, modules);
    await seedDataset(t, 'v1');
    await stageDataset(t, 'v2', { stageBatchCount: 1, commit: false });
    await expect(
      stageDataset(t, 'v3', { stageBatchCount: 1, commit: false }),
    ).rejects.toThrow(/another content generation is pending/);
  });

  test('an obsolete prune cannot delete the current generation', async () => {
    const t = convexTest(schema, modules);
    await seedDataset(t, 'v1');
    await stageDataset(t, 'v2', emptyGeneration);
    expect(
      await t.mutation(internal.sync.pruneBatch, { syncVersion: 'v1' }),
    ).toEqual({ deleted: 0 });
    const active = await t.run(
      async (ctx) =>
        await ctx.db
          .query('entries')
          .withIndex('by_syncVersion', (q) => q.eq('syncVersion', 'v2'))
          .collect(),
    );
    expect(active).toHaveLength(1);
  });
});
