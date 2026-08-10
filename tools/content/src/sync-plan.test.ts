import { describe, expect, test } from 'vitest';

import type { CompiledDataset } from './model.js';
import {
  createSyncPlan,
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
});

describe('isSyncConverged', () => {
  test('treats legacy metadata without prunePending as converged', () => {
    expect(isSyncConverged({})).toBe(true);
    expect(isSyncConverged({ prunePending: false })).toBe(true);
    expect(isSyncConverged({ prunePending: true })).toBe(false);
  });
});
