import { describe, expect, test } from 'vitest';

import { parseTagEntryType, parseTagPage, tagRedirectPath } from './tagRouting';

describe('tag routing', () => {
  test('preserves validated filters and clamps pagination in redirect URLs', () => {
    expect(tagRedirectPath('identity-access', 'ACRONYM', 7)).toBe(
      '/tags/identity-access?type=ACRONYM&page=7',
    );
    expect(tagRedirectPath('identity-access', undefined, 101)).toBe(
      '/tags/identity-access?page=100',
    );
    expect(parseTagEntryType('invalid')).toBeUndefined();
    expect(parseTagPage('-2')).toBe(1);
    expect(parseTagPage('101')).toBe(100);
  });
});
