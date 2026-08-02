import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { internal } from '../../convex/_generated/api';
import schema from '../../convex/schema';
import { makeEntryRow, modules, seedDataset } from './helpers';

// Fake timers must be active while mutations schedule follow-ups, so
// finishAllScheduledFunctions can drive the prune chain to completion.
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

async function runScheduled(t: ReturnType<typeof convexTest>) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

describe('sync', () => {
  test('upserts are idempotent: re-running the same sync changes nothing', async () => {
    const t = convexTest(schema, modules);
    await seedDataset(t, 'v1');
    await runScheduled(t);
    const before = await t.run(async (ctx) => ({
      entries: await ctx.db.query('entries').collect(),
      senses: await ctx.db.query('senses').collect(),
    }));
    await seedDataset(t, 'v1');
    await runScheduled(t);
    const after = await t.run(async (ctx) => ({
      entries: await ctx.db.query('entries').collect(),
      senses: await ctx.db.query('senses').collect(),
    }));
    expect(after.entries.map((e) => e._id).sort()).toEqual(before.entries.map((e) => e._id).sort());
    expect(after.senses).toHaveLength(before.senses.length);
  });

  test('a new sync version prunes rows the dataset no longer contains', async () => {
    const t = convexTest(schema, modules);
    await seedDataset(t, 'v1');
    await runScheduled(t);

    // v2 drops the ACRONYM entry, its relationship, and the redirect.
    await t.mutation(internal.sync.upsertTags, {
      syncVersion: 'v2',
      rows: [{ slug: 'malware', name: 'Malware', entryCount: 1 }],
    });
    await t.mutation(internal.sync.upsertEntries, { syncVersion: 'v2', rows: [makeEntryRow()] });
    await t.mutation(internal.sync.finish, { syncVersion: 'v2', entryCount: 1 });
    await runScheduled(t);

    const rows = await t.run(async (ctx) => ({
      entries: await ctx.db.query('entries').collect(),
      senses: await ctx.db.query('senses').collect(),
      relationships: await ctx.db.query('relationships').collect(),
      redirects: await ctx.db.query('redirects').collect(),
      sources: await ctx.db.query('sources').collect(),
    }));
    expect(rows.entries.map((e) => e.key)).toEqual(['TERM:back-door']);
    expect(rows.senses.map((s) => s.entryKey)).toEqual(['TERM:back-door']);
    expect(rows.relationships).toHaveLength(0);
    expect(rows.redirects).toHaveLength(0);
    // sources were not re-upserted in v2, so they are pruned too — every sync
    // must push the full dataset.
    expect(rows.sources).toHaveLength(0);

    const status = await t.query(internal.sync.status, {});
    expect(status?.contentVersion).toBe('v2');
    expect(status?.entryCount).toBe(1);
  });

  test('a superseded prune cannot delete rows from the current sync', async () => {
    const t = convexTest(schema, modules);
    await seedDataset(t, 'v1');
    await runScheduled(t);

    await t.mutation(internal.sync.upsertEntries, { syncVersion: 'v2', rows: [makeEntryRow()] });
    await t.mutation(internal.sync.finish, { syncVersion: 'v2', entryCount: 1 });

    const result = await t.mutation(internal.sync.pruneBatch, { syncVersion: 'v1' });
    expect(result).toEqual({ deleted: 0 });

    const rows = await t.run(async (ctx) => await ctx.db.query('entries').collect());
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.key === 'TERM:back-door')?.syncVersion).toBe('v2');
  });
});
