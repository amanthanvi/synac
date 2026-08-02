import { describe, expect, it } from 'vitest';

import { markdownToText, normalizeTitle, slugify } from './text';

describe('normalizeTitle', () => {
  it('collapses whitespace and lowercases', () => {
    expect(normalizeTitle('  Zero   Trust ')).toBe('zero trust');
  });
});

describe('slugify', () => {
  it('produces kebab-case slugs', () => {
    expect(slugify('Zero Trust (ZT)')).toBe('zero-trust-zt');
    expect(slugify('  C2  ')).toBe('c2');
  });

  it('strips leading/trailing separators', () => {
    expect(slugify('...back door!')).toBe('back-door');
  });
});

describe('markdownToText', () => {
  it('strips markup, keeps link text, and drops inline code', () => {
    expect(markdownToText('A **hidden** [mechanism](https://x.test) with `code`.')).toBe(
      'A hidden mechanism with .',
    );
  });
});
