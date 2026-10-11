import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/convex', () => ({
  readBrowsePage: vi.fn(),
}));

vi.mock('@/components/BrowseControls', () => ({
  BrowseControls: () => null,
}));

import { readBrowsePage } from '@/lib/convex';

import { BrowsePage } from './BrowsePage';

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

async function renderTerms(params: Record<string, string>): Promise<string> {
  const tree = await BrowsePage({
    entryType: 'TERM',
    searchParams: Promise.resolve(params),
  });
  return renderToStaticMarkup(tree);
}

beforeEach(() => {
  vi.mocked(readBrowsePage).mockReset();
  vi.mocked(readBrowsePage).mockResolvedValue(cappedBrowse);
});

describe('BrowsePage refine hint at the page cap', () => {
  test('suggests search or a tag when nothing narrows the list', async () => {
    const html = await renderTerms({ letter: 'c', page: '10' });

    expect(html).toContain('Search within this letter');
    expect(html).toContain('choose a tag');
    expect(html).not.toContain('Narrow the search');
    expect(html).toContain('href="#browse-filter"');
    expect(html).toContain('href="#browse-tags"');
  });

  test('says to narrow the search when a query is active', async () => {
    const html = await renderTerms({ letter: 'c', page: '10', q: 'cyber' });

    expect(html).toContain('Narrow the search');
    expect(html).not.toContain('Search within this letter');
    expect(html).not.toContain('choose a tag');
  });

  test('says to narrow the search when a tag is active', async () => {
    vi.mocked(readBrowsePage).mockResolvedValue({
      ...cappedBrowse,
      activeTag: { slug: 'cryptography', name: 'Cryptography' },
    });
    const html = await renderTerms({
      letter: 'c',
      page: '10',
      tag: 'cryptography',
    });

    expect(html).toContain('Narrow the search');
    expect(html).not.toContain('choose a tag');
  });

  test('omits the hint and keeps a Next link to page 10 on an uncapped page', async () => {
    const html = await renderTerms({ letter: 'c', page: '9' });

    expect(html).not.toContain('This is the last page browse can show');
    expect(html).toContain('page=10');
  });
});
