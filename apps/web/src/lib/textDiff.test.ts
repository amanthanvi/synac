import { describe, expect, test } from 'vitest';

import { diffWords } from './textDiff';

function changed(base: string, text: string): string[] {
  return diffWords(base, text)
    .filter((token) => token.changed)
    .map((token) => token.text.trim());
}

describe('diffWords', () => {
  test('marks nothing when the wording matches', () => {
    const tokens = diffWords('a set of users', 'A set of users.');
    expect(tokens.every((token) => !token.changed)).toBe(true);
    expect(tokens.map((token) => token.text).join('')).toBe('A set of users.');
  });

  test('marks inserted words only', () => {
    expect(changed('a set of users', 'a large set of trusted users')).toEqual([
      'large',
      'trusted',
    ]);
  });

  test('marks replacements as additions', () => {
    expect(changed('encrypted data', 'plaintext data')).toEqual(['plaintext']);
  });

  test('reproduces the compared text exactly', () => {
    const text = 'Designation  applied to\ninformation systems.';
    expect(
      diffWords('unrelated wording', text)
        .map((t) => t.text)
        .join(''),
    ).toBe(text);
  });

  test('handles empty input on either side', () => {
    expect(diffWords('', '')).toEqual([]);
    expect(diffWords('', 'new text')).toEqual([
      { text: 'new text', changed: true },
    ]);
    expect(diffWords('old text', '')).toEqual([]);
  });
});
