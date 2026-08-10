import { describe, expect, test } from 'vitest';

import type { CompiledDataset } from './model.js';
import {
  ENTRY_SYNC_CHUNK,
  MAX_SYNC_BATCHES,
  REDIRECT_SYNC_CHUNK,
  RELATIONSHIP_SYNC_CHUNK,
  SOURCE_SYNC_CHUNK,
  TAG_REDIRECT_SYNC_CHUNK,
  TAG_SYNC_CHUNK,
  assertSyncBatchLimit,
  createSyncPlan,
  isSyncCommitApplied,
  isSyncConverged,
  syncPayloadHash,
} from './sync-plan.js';

function dataset(): CompiledDataset {
  return {
    contentVersion: 'v1',
    sources: [
      {
        slug: 'source',
        name: 'Source',
        baseUrl: 'https://example.com',
        licenseType: 'OTHER',
        licenseUrl: undefined,
        licenseNotes: undefined,
        allowedUse: 'Attribution',
        attributionRequirements: 'Example',
        trustTier: 'TIER1',
        enabled: true,
        lastVerifiedAt: 1,
        citedEntryCount: 1,
      },
    ],
    tags: [
      {
        slug: 'malware',
        name: 'Malware',
        description: undefined,
        entryCount: 1,
      },
    ],
    entries: [
      {
        key: 'TERM:test',
        entryType: 'TERM',
        slug: 'test',
        title: 'Test',
        normalizedTitle: 'test',
        aliases: [],
        summaryMd: undefined,
        summaryText: undefined,
        editorialNotes: undefined,
        updatedAt: 1,
        senseCount: 1,
        senseSummary: undefined,
        searchDocument: 'test',
        tagSlugs: ['malware'],
        citedSourceSlugs: ['source'],
      },
    ],
    senses: [
      {
        entryKey: 'TERM:test',
        key: 'source:test',
        order: 0,
        label: undefined,
        definitionMd: 'Definition.',
        definitionText: 'Definition.',
        expandedForm: undefined,
        isEditorial: false,
        editorialRationale: undefined,
        isPreferred: true,
        examples: [],
        citations: [],
      },
    ],
    relationships: [],
    redirects: [],
    tagRedirects: [],
  };
}

describe('createSyncPlan', () => {
  test('builds deterministic ordered batches and exact counters', () => {
    const first = createSyncPlan(dataset());
    const second = createSyncPlan(dataset());
    expect(first).toEqual(second);
    expect(first.batches.map((batch) => batch.kind)).toEqual([
      'sources',
      'tags',
      'entries',
      'redirects',
      'tagRedirects',
    ]);
    expect(first.expectedCounts).toEqual({
      sources: 1,
      tags: 1,
      entries: 1,
      senses: 1,
      entryTags: 1,
      entrySources: 1,
      relationships: 0,
      redirects: 0,
      tagRedirects: 0,
    });
    expect(first.expectedTagCounts).toEqual({ malware: 1 });
    expect(first.expectedSourceCounts).toEqual({ source: 1 });
  });

  test('canonical hashes ignore object insertion order and undefined fields', () => {
    expect(syncPayloadHash({ b: 2, a: 1, omitted: undefined })).toBe(
      syncPayloadHash({ a: 1, b: 2 }),
    );
  });

  test('a content-field mutation changes its batch and manifest hashes', () => {
    const original = createSyncPlan(dataset());
    const changedDataset = dataset();
    const entry = changedDataset.entries[0];
    if (!entry) throw new Error('fixture entry missing');
    entry.title = 'Changed';
    const changed = createSyncPlan(changedDataset);
    expect(
      changed.batches.find((batch) => batch.kind === 'entries')?.hash,
    ).not.toBe(
      original.batches.find((batch) => batch.kind === 'entries')?.hash,
    );
    expect(changed.manifestHash).not.toBe(original.manifestHash);
  });

  test('chunks every batch kind at its bounded transport size', () => {
    const value = dataset();
    const source = value.sources[0];
    const tag = value.tags[0];
    const entry = value.entries[0];
    if (!source || !tag || !entry) throw new Error('fixture rows missing');
    value.sources = Array.from(
      { length: SOURCE_SYNC_CHUNK + 1 },
      (_unused, index) => ({ ...source, slug: `source-${index}` }),
    );
    value.tags = Array.from(
      { length: TAG_SYNC_CHUNK + 1 },
      (_unused, index) => ({ ...tag, slug: `tag-${index}` }),
    );
    value.entries = Array.from(
      { length: ENTRY_SYNC_CHUNK + 1 },
      (_unused, index) => ({ ...entry, key: `TERM:test-${index}` }),
    );
    value.senses = [];
    value.relationships = Array.from(
      { length: RELATIONSHIP_SYNC_CHUNK + 1 },
      (_unused, index) => ({
        fromKey: `TERM:from-${index}`,
        toKey: `TERM:to-${index}`,
        type: 'RELATED' as const,
      }),
    );
    value.redirects = Array.from(
      { length: REDIRECT_SYNC_CHUNK + 1 },
      (_unused, index) => ({
        entryType: 'TERM' as const,
        fromSlug: `from-${index}`,
        toSlug: `to-${index}`,
      }),
    );
    value.tagRedirects = Array.from(
      { length: TAG_REDIRECT_SYNC_CHUNK + 1 },
      (_unused, index) => ({
        fromSlug: `old-${index}`,
        toSlug: `new-${index}`,
      }),
    );

    const plan = createSyncPlan(value);
    const limits = {
      sources: SOURCE_SYNC_CHUNK,
      tags: TAG_SYNC_CHUNK,
      entries: ENTRY_SYNC_CHUNK,
      relationships: RELATIONSHIP_SYNC_CHUNK,
      redirects: REDIRECT_SYNC_CHUNK,
      tagRedirects: TAG_REDIRECT_SYNC_CHUNK,
    };
    for (const batch of plan.batches) {
      expect(batch.rows.length).toBeLessThanOrEqual(limits[batch.kind]);
    }
    for (const kind of Object.keys(limits)) {
      expect(plan.batches.filter((batch) => batch.kind === kind)).toHaveLength(
        2,
      );
    }
  });

  test('mirrors the server batch-count safety limit', () => {
    expect(() => assertSyncBatchLimit(MAX_SYNC_BATCHES)).not.toThrow();
    expect(() => assertSyncBatchLimit(MAX_SYNC_BATCHES + 1)).toThrow(
      /1000-batch safety limit/,
    );
  });
});

describe('isSyncConverged', () => {
  test('treats legacy metadata without prunePending as converged', () => {
    expect(isSyncConverged({})).toBe(true);
    expect(isSyncConverged({ prunePending: false })).toBe(true);
    expect(isSyncConverged({ prunePending: true })).toBe(false);
  });

  test('recognizes a commit that succeeded despite a failed client response', () => {
    expect(isSyncCommitApplied({ contentVersion: 'v2' }, 'v2')).toBe(true);
    expect(isSyncCommitApplied({ contentVersion: 'v1' }, 'v2')).toBe(false);
    expect(isSyncCommitApplied({}, 'v2')).toBe(false);
  });
});
