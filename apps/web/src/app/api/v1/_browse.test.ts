import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/rateLimit', () => ({
  enforceRateLimit: vi.fn(async () => ({
    allowed: true,
    retryAfterSeconds: 0,
  })),
}));

vi.mock('@/lib/convex', () => ({
  readBrowsePage: vi.fn(),
}));

import { readBrowsePage } from '@/lib/convex';

import { browseResponse } from './_browse';

const cappedBrowse = {
  activeTag: null,
  tags: [],
  entries: [
    {
      key: 'TERM:cybersecurity',
      entryType: 'TERM' as const,
      slug: 'cybersecurity',
      title: 'cybersecurity',
      summaryText: 'Practice of protecting systems.',
      senseSummary: null,
      updatedAt: Date.parse('2026-08-02T00:00:00Z'),
      tags: [],
    },
  ],
  totalMatches: 849,
  hasMore: true,
};

function requestFor(page: number): Request {
  return new Request(`https://synac.app/api/v1/terms?letter=c&page=${page}`);
}

beforeEach(() => {
  vi.mocked(readBrowsePage).mockReset();
  vi.mocked(readBrowsePage).mockResolvedValue(cappedBrowse);
});

describe('browseResponse page cap', () => {
  test('reports another page below the cap and stops on the capped page', async () => {
    const below = await browseResponse(requestFor(9), 'TERM', 'listTerms');
    const atCap = await browseResponse(requestFor(10), 'TERM', 'listTerms');
    const pastCap = await browseResponse(requestFor(11), 'TERM', 'listTerms');

    expect(below.status).toBe(200);
    expect(atCap.status).toBe(200);
    expect(pastCap.status).toBe(200);

    const belowBody = await below.json();
    const atCapBody = await atCap.json();
    const pastCapBody = await pastCap.json();

    expect(belowBody.meta).toMatchObject({
      letter: 'c',
      page: 9,
      total: 849,
      hasMore: true,
    });
    expect(atCapBody.meta).toMatchObject({
      letter: 'c',
      page: 10,
      total: 849,
      hasMore: false,
    });
    expect(pastCapBody.meta).toMatchObject({
      letter: 'c',
      page: 10,
      total: 849,
      hasMore: false,
    });
    expect(pastCapBody.results).toEqual(atCapBody.results);

    expect(readBrowsePage).toHaveBeenNthCalledWith(
      1,
      'TERM',
      'c',
      9,
      50,
      'title',
      '',
      null,
    );
    expect(readBrowsePage).toHaveBeenNthCalledWith(
      2,
      'TERM',
      'c',
      10,
      50,
      'title',
      '',
      null,
    );
    expect(readBrowsePage).toHaveBeenNthCalledWith(
      3,
      'TERM',
      'c',
      10,
      50,
      'title',
      '',
      null,
    );
  });
});
