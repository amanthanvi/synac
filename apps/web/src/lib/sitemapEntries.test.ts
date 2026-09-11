import { describe, expect, test } from 'vitest';

import { collectEntrySlugs, type EntrySitemapPage } from './sitemapEntries';

describe('collectEntrySlugs', () => {
  test('restarts once without mixing generations', async () => {
    const pages: EntrySitemapPage[] = [
      {
        page: [{ slug: 'old', updatedAt: 1 }],
        isDone: false,
        continueCursor: 'old-cursor',
        contentVersion: 'v1',
        generationChanged: false,
      },
      {
        page: [],
        isDone: true,
        continueCursor: '',
        contentVersion: 'v2',
        generationChanged: true,
      },
      {
        page: [{ slug: 'new', updatedAt: 2 }],
        isDone: true,
        continueCursor: '',
        contentVersion: 'v2',
        generationChanged: false,
      },
    ];
    const requests: Array<{
      cursor: string | null;
      expectedVersion: string | null;
    }> = [];
    const records = await collectEntrySlugs({
      entryType: 'TERM',
      fetchPage: async (request) => {
        requests.push(request);
        const page = pages.shift();
        if (!page) throw new Error('missing test page');
        return page;
      },
    });
    expect(requests).toEqual([
      { cursor: null, expectedVersion: null },
      { cursor: 'old-cursor', expectedVersion: 'v1' },
      { cursor: null, expectedVersion: 'v2' },
    ]);
    expect(records.map((record) => record.slug)).toEqual(['new']);
  });

  test('fails if the generation changes twice', async () => {
    await expect(
      collectEntrySlugs({
        entryType: 'ACRONYM',
        fetchPage: async () => ({
          page: [],
          isDone: true,
          continueCursor: '',
          contentVersion: 'changing',
          generationChanged: true,
        }),
      }),
    ).rejects.toThrow(/changed twice/);
  });
});
