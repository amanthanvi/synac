import { describe, expect, test } from 'vitest';

import {
  collectEntrySitemapUrls,
  type EntrySitemapPage,
} from './sitemapEntries';

describe('collectEntrySitemapUrls', () => {
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
    const urls = await collectEntrySitemapUrls({
      siteUrl: 'https://synac.app',
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
    expect(urls.map((url) => url.loc)).toEqual(['https://synac.app/term/new']);
  });

  test('fails if the generation changes twice', async () => {
    await expect(
      collectEntrySitemapUrls({
        siteUrl: 'https://synac.app',
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
