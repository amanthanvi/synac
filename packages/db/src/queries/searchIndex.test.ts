import { describe, expect, it } from 'vitest';

import {
  getSearchIndexCoverage,
  rebuildSearchIndex,
} from './searchIndex.js';

type GlobalSearchIndexState = typeof globalThis & {
  __searchIndexQueryCount?: number;
};

describe('search index helpers', () => {
  it('reports coverage from published, indexed, missing, and orphaned rows', async () => {
    const globalState = globalThis as GlobalSearchIndexState;
    const db = {
      entry: {
        count: async () => 3,
      },
      entrySearch: {
        count: async () => 2,
      },
      $queryRaw: async () => {
        if (!globalState.__searchIndexQueryCount) {
          globalState.__searchIndexQueryCount = 1;
          return [{ id: 'missing-entry' }];
        }

        return [{ id: 'orphaned-entry' }];
      },
    } as unknown as {
      entry: { count: () => Promise<number> };
      entrySearch: { count: () => Promise<number> };
      $queryRaw: (query: unknown) => Promise<Array<{ id: string }>>;
    };

    const coverage = await getSearchIndexCoverage(
      db as never,
      { limit: 25 },
    );

    expect(coverage).toEqual({
      publishedEntries: 3,
      indexedEntries: 2,
      missingEntryIds: ['missing-entry'],
      orphanedEntryIds: ['orphaned-entry'],
    });

    delete globalState.__searchIndexQueryCount;
  });

  it('rebuilds only the requested entry ids when provided', async () => {
    const executed: unknown[] = [];
    const db = {
      $executeRaw: async (query: unknown) => {
        executed.push(query);
        return 1;
      },
    } as unknown as {
      $executeRaw: (query: unknown) => Promise<number>;
    };

    const result = await rebuildSearchIndex(db as never, {
      entryIds: ['a', ' ', 'b'],
    });

    expect(result).toEqual({ rebuiltCount: 2 });
    expect(executed).toHaveLength(1);
  });

  it('rebuilds the full published corpus when ids are omitted', async () => {
    const executed: unknown[] = [];
    const db = {
      $queryRaw: async () => [{ id: '1' }, { id: '2' }, { id: '3' }],
      $executeRaw: async (query: unknown) => {
        executed.push(query);
        return 3;
      },
    } as unknown as {
      $queryRaw: (query: unknown) => Promise<Array<{ id: string }>>;
      $executeRaw: (query: unknown) => Promise<number>;
    };

    const result = await rebuildSearchIndex(db as never);

    expect(result).toEqual({ rebuiltCount: 3 });
    expect(executed).toHaveLength(1);
  });
});
