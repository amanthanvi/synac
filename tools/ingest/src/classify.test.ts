import { describe, expect, it } from 'vitest';

import { normalizeTitle } from '@synac/content-tools';

import {
  classifyEntryType,
  classifyVariantType,
  isInitialism,
  isInitialismOf,
} from './classify.js';

describe('classifyEntryType', () => {
  it('treats compact all-caps and letter-digit short forms as acronyms', () => {
    expect(classifyEntryType('TLS')).toBe('ACRONYM');
    expect(classifyEntryType('S/MIME')).toBe('ACRONYM');
    expect(classifyEntryType('2FA')).toBe('ACRONYM');
    expect(classifyEntryType('C2')).toBe('ACRONYM');
  });

  it('treats phrases, single letters, and long strings as terms', () => {
    expect(classifyEntryType('zero trust')).toBe('TERM');
    expect(classifyEntryType('abstraction')).toBe('TERM');
    expect(classifyEntryType('A')).toBe('TERM');
    expect(classifyEntryType('A'.repeat(33))).toBe('TERM');
  });

  it('applies the same 2..32 length rule everywhere', () => {
    expect(isInitialism('A'.repeat(32))).toBe(true);
    expect(isInitialism('A'.repeat(33))).toBe(false);
  });
});

describe('classifyVariantType', () => {
  it('separates synonyms, abbreviations, and plain aliases', () => {
    expect(classifyVariantType('Two-Factor Authentication')).toBe('SYNONYM');
    expect(classifyVariantType('ASN.1')).toBe('ABBREVIATION');
    expect(classifyVariantType('AES')).toBe('ABBREVIATION');
    expect(classifyVariantType('keying')).toBe('ALIAS');
    expect(classifyVariantType('')).toBe('ALIAS');
  });
});

describe('isInitialismOf', () => {
  it('matches first-letter initialisms of multi-word titles', () => {
    expect(isInitialismOf('AES', 'Advanced Encryption Standard')).toBe(true);
    expect(isInitialismOf('DOI', 'Domain of Interpretation')).toBe(true);
    expect(
      isInitialismOf('S/MIME', 'Secure Multipurpose Internet Mail Extensions'),
    ).toBe(true);
  });

  it('rejects unrelated variants and single-word titles', () => {
    expect(isInitialismOf('abstraction', '2FA')).toBe(false);
    expect(isInitialismOf('AES', 'Rijndael')).toBe(false);
    expect(isInitialismOf('A', 'Advanced Encryption Standard')).toBe(false);
  });
});

describe('normalizeTitle', () => {
  it('collapses whitespace and lowercases', () => {
    expect(normalizeTitle('  Security   Domain ')).toBe('security domain');
  });
});
