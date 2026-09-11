import { describe, expect, it } from 'vitest';

import { diffWords, hasDifferences } from './textDiff';

describe('diffWords', () => {
  it('returns nothing for an empty candidate', () => {
    expect(diffWords('a b c', '   ')).toEqual([]);
  });

  it('marks the whole candidate as added when the base is empty', () => {
    expect(diffWords('', 'a protocol')).toEqual([
      { kind: 'added', text: 'a protocol' },
    ]);
  });

  it('marks identical text as unchanged', () => {
    expect(diffWords('a shared secret', 'a shared secret')).toEqual([
      { kind: 'same', text: 'a shared secret' },
    ]);
  });

  it('marks inserted words and merges adjacent runs', () => {
    expect(
      diffWords('a shared secret', 'a securely shared pre secret'),
    ).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'added', text: 'securely' },
      { kind: 'same', text: 'shared' },
      { kind: 'added', text: 'pre' },
      { kind: 'same', text: 'secret' },
    ]);
  });

  it('does not report deletions from the base', () => {
    expect(diffWords('a long shared secret', 'a secret')).toEqual([
      { kind: 'same', text: 'a secret' },
    ]);
  });

  it('ignores case and edge punctuation when matching', () => {
    expect(
      diffWords('uses TLS for transport', 'Uses tls, for transport'),
    ).toEqual([{ kind: 'same', text: 'Uses tls, for transport' }]);
  });

  it('reconstructs the candidate exactly, in order', () => {
    const candidate = 'the quick brown fox jumps over the lazy dog';
    const segments = diffWords('the brown fox sleeps', candidate);
    expect(segments.map((s) => s.text).join(' ')).toBe(candidate);
  });

  it('falls back to unchanged for oversized inputs', () => {
    const base = Array.from({ length: 1000 }, (_, i) => `w${i}`).join(' ');
    const candidate = Array.from({ length: 1000 }, (_, i) => `x${i}`).join(' ');
    const segments = diffWords(base, candidate);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.kind).toBe('same');
  });
});

describe('hasDifferences', () => {
  it('detects added words', () => {
    expect(hasDifferences('a secret', 'a shared secret')).toBe(true);
    expect(hasDifferences('a shared secret', 'a secret')).toBe(false);
  });
});
