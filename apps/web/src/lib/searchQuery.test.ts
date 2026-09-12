import { describe, expect, test } from 'vitest';

import {
  isIgnoredSearchQuery,
  MAX_QUERY_LENGTH,
  normalizeSearchQuery,
  parseEntryTypeParam,
  parseSearchPage,
  parseSearchScope,
} from './searchQuery';

describe('normalizeSearchQuery', () => {
  test('collapses whitespace, lowercases, and truncates', () => {
    expect(normalizeSearchQuery('  SOC   Analyst ')).toBe('soc analyst');
    expect(normalizeSearchQuery('x'.repeat(200))).toHaveLength(
      MAX_QUERY_LENGTH,
    );
  });
});

describe('isIgnoredSearchQuery', () => {
  test('ignores single characters and bare stopwords', () => {
    expect(isIgnoredSearchQuery('a')).toBe(true);
    expect(isIgnoredSearchQuery(' THE ')).toBe(true);
    expect(isIgnoredSearchQuery('')).toBe(true);
    expect(isIgnoredSearchQuery('soc')).toBe(false);
    expect(isIgnoredSearchQuery('the onion router')).toBe(false);
  });
});

describe('parsers', () => {
  test('clamps the page to the backend window', () => {
    expect(parseSearchPage(undefined)).toBe(1);
    expect(parseSearchPage('0')).toBe(1);
    expect(parseSearchPage('nope')).toBe(1);
    expect(parseSearchPage('3')).toBe(3);
    expect(parseSearchPage('99')).toBe(10);
  });

  test('reads the entry type and scope filters', () => {
    expect(parseEntryTypeParam('term')).toBe('TERM');
    expect(parseEntryTypeParam('ACRONYM')).toBe('ACRONYM');
    expect(parseEntryTypeParam('other')).toBeNull();
    expect(parseSearchScope('senses')).toBe('senses');
    expect(parseSearchScope(undefined)).toBe('entries');
  });
});
