import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  classifiedEntryRows,
  corpusHashFromEntryHashes,
  stableJsonHash,
} from './tagging.js';

describe('stableJsonHash', () => {
  it('canonicalizes object keys recursively while preserving array order', () => {
    const first = {
      z: [{ beta: 2, alpha: 1 }],
      nested: { outerZ: { y: 2, x: 1 }, outerA: true },
      omitted: undefined,
    };
    const reordered = {
      nested: { outerA: true, outerZ: { x: 1, y: 2 } },
      z: [{ alpha: 1, beta: 2 }],
    };
    expect(stableJsonHash(first)).toBe(stableJsonHash(reordered));
    expect(stableJsonHash({ values: [1, 2] })).not.toBe(
      stableJsonHash({ values: [2, 1] }),
    );
  });
});

describe('corpusHashFromEntryHashes', () => {
  // The offline tagging manifests bind this exact serialization, so the
  // classifiedEntries rows must reproduce it byte for byte.
  it('hashes the entry-key-ordered classifiedEntries rows', () => {
    const alpha = '1'.repeat(64);
    const beta = '2'.repeat(64);
    const rows = [
      { entryKey: 'ACRONYM:alpha', entryContentHash: alpha },
      { entryKey: 'TERM:beta', entryContentHash: beta },
    ];
    expect(
      classifiedEntryRows({ 'TERM:beta': beta, 'ACRONYM:alpha': alpha }),
    ).toEqual(rows);
    const expected = createHash('sha256')
      .update(JSON.stringify(rows))
      .digest('hex');
    expect(
      corpusHashFromEntryHashes({ 'TERM:beta': beta, 'ACRONYM:alpha': alpha }),
    ).toBe(expected);
    expect(
      corpusHashFromEntryHashes({ 'ACRONYM:alpha': alpha, 'TERM:beta': beta }),
    ).toBe(expected);
    expect(
      corpusHashFromEntryHashes({ 'ACRONYM:alpha': beta, 'TERM:beta': alpha }),
    ).not.toBe(expected);
  });
});
