import { createHash } from 'node:crypto';

import type { CompiledDataset, CompiledSense } from './model.js';

export const ENTRY_SYNC_CHUNK = 25;
export const RELATIONSHIP_SYNC_CHUNK = 200;

export type GenerationCounts = {
  sources: number;
  tags: number;
  entries: number;
  senses: number;
  entryTags: number;
  entrySources: number;
  relationships: number;
  redirects: number;
  tagRedirects: number;
};

export type SyncBatchKind =
  | 'sources'
  | 'tags'
  | 'entries'
  | 'relationships'
  | 'redirects'
  | 'tagRedirects';

export type SyncBatch = {
  kind: SyncBatchKind;
  rows: unknown[];
  hash: string;
};

export type SyncPlan = {
  syncVersion: string;
  manifestHash: string;
  batchHashes: string[];
  expectedCounts: GenerationCounts;
  expectedTagCounts: Record<string, number>;
  expectedSourceCounts: Record<string, number>;
  batches: SyncBatch[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] !== undefined) result[key] = canonicalize(value[key]);
  }
  return result;
}

export function syncPayloadHash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function isSyncConverged(status: { prunePending?: boolean }): boolean {
  return status.prunePending !== true;
}

function makeBatch(kind: SyncBatchKind, rows: unknown[]): SyncBatch {
  const cleanRows = stripUndefined(rows);
  return {
    kind,
    rows: cleanRows,
    hash: syncPayloadHash({ kind, rows: cleanRows }),
  };
}

export function createSyncPlan(dataset: CompiledDataset): SyncPlan {
  const sensesByEntry = new Map<string, CompiledSense[]>();
  for (const sense of dataset.senses) {
    const senses = sensesByEntry.get(sense.entryKey) ?? [];
    senses.push(sense);
    sensesByEntry.set(sense.entryKey, senses);
  }
  const entryRows = dataset.entries.map((entry) => ({
    ...entry,
    senses: (sensesByEntry.get(entry.key) ?? []).map(
      ({ entryKey: _entryKey, ...sense }) => sense,
    ),
  }));

  const batches: SyncBatch[] = [
    makeBatch('sources', dataset.sources),
    makeBatch('tags', dataset.tags),
    ...chunk(entryRows, ENTRY_SYNC_CHUNK).map((rows) =>
      makeBatch('entries', rows),
    ),
    ...chunk(dataset.relationships, RELATIONSHIP_SYNC_CHUNK).map((rows) =>
      makeBatch('relationships', rows),
    ),
    makeBatch('redirects', dataset.redirects),
    makeBatch('tagRedirects', dataset.tagRedirects),
  ];

  const expectedCounts: GenerationCounts = {
    sources: dataset.sources.length,
    tags: dataset.tags.length,
    entries: dataset.entries.length,
    senses: dataset.senses.length,
    entryTags: dataset.entries.reduce(
      (total, entry) => total + entry.tagSlugs.length,
      0,
    ),
    entrySources: dataset.entries.reduce(
      (total, entry) => total + entry.citedSourceSlugs.length,
      0,
    ),
    relationships: dataset.relationships.length,
    redirects: dataset.redirects.length,
    tagRedirects: dataset.tagRedirects.length,
  };
  const expectedTagCounts = Object.fromEntries(
    dataset.tags.map((tag) => [tag.slug, tag.entryCount]),
  );
  const expectedSourceCounts = Object.fromEntries(
    dataset.sources.map((source) => [source.slug, source.citedEntryCount]),
  );
  const batchHashes = batches.map((batch) => batch.hash);
  const manifestHash = syncPayloadHash({
    syncVersion: dataset.contentVersion,
    batchHashes,
    expectedCounts,
    expectedTagCounts,
    expectedSourceCounts,
  });
  return {
    syncVersion: dataset.contentVersion,
    manifestHash,
    batchHashes,
    expectedCounts,
    expectedTagCounts,
    expectedSourceCounts,
    batches,
  };
}
