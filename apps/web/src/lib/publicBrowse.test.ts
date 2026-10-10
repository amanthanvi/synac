import { describe, expect, test } from 'vitest';

import {
  BROWSE_PAGE_MAX,
  browseNeedsRefineHint,
  browseNextHref,
  browseOffersNextPage,
  normalizeBrowsePage,
} from './publicBrowse';

const letterC = {
  basePath: '/terms' as const,
  letter: 'c',
  sort: 'title' as const,
  query: '',
  tagSlug: null,
};

describe('browse page cap', () => {
  test('clamps a requested page onto the last served page', () => {
    expect(BROWSE_PAGE_MAX).toBe(10);
    expect(normalizeBrowsePage('10')).toBe(10);
    expect(normalizeBrowsePage('11')).toBe(10);
    expect(normalizeBrowsePage('0')).toBe(1);
    expect(normalizeBrowsePage('nope')).toBe(1);
  });

  test('offers a next page only when the backend will serve it', () => {
    expect(browseOffersNextPage(9, true)).toBe(true);
    expect(browseOffersNextPage(BROWSE_PAGE_MAX, true)).toBe(false);
    expect(browseOffersNextPage(BROWSE_PAGE_MAX + 1, true)).toBe(false);
    expect(browseOffersNextPage(9, false)).toBe(false);
    expect(browseOffersNextPage(1, false)).toBe(false);
  });

  test('does not build a Next link that the page cap would clamp', () => {
    expect(browseNextHref({ ...letterC, page: 9, hasMore: true })).toBe(
      '/terms?letter=c&page=10',
    );
    expect(
      browseNextHref({ ...letterC, page: BROWSE_PAGE_MAX, hasMore: true }),
    ).toBeUndefined();
    expect(
      browseNextHref({ ...letterC, page: 4, hasMore: false }),
    ).toBeUndefined();
    expect(
      browseNextHref({
        ...letterC,
        page: 2,
        sort: 'updated',
        query: 'cyber',
        tagSlug: 'cryptography',
        hasMore: true,
      }),
    ).toBe('/terms?letter=c&page=3&sort=updated&q=cyber&tag=cryptography');
  });

  test('asks for a refine hint only when more matches sit past the cap', () => {
    expect(browseNeedsRefineHint(BROWSE_PAGE_MAX, true)).toBe(true);
    expect(browseNeedsRefineHint(BROWSE_PAGE_MAX + 1, true)).toBe(true);
    expect(browseNeedsRefineHint(BROWSE_PAGE_MAX, false)).toBe(false);
    expect(browseNeedsRefineHint(9, true)).toBe(false);
    expect(browseNeedsRefineHint(1, false)).toBe(false);
  });
});
