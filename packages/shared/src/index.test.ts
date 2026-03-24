import { describe, expect, it } from 'vitest';

import { getBoolean, getNumber, getString, normalizeOptional } from './index.js';

describe('shared request helpers', () => {
  it('returns strings only when values are strings', () => {
    expect(getString({ a: 'hello', b: 42 }, 'a')).toBe('hello');
    expect(getString({ a: 'hello', b: 42 }, 'b')).toBe('');
  });

  it('coerces numeric-ish values to numbers', () => {
    expect(getNumber({ a: 12, b: '7' }, 'a')).toBe(12);
    expect(getNumber({ a: 12, b: '7' }, 'b')).toBe(7);
  });

  it('parses booleans from booleans and strings', () => {
    expect(getBoolean({ a: true }, 'a')).toBe(true);
    expect(getBoolean({ a: 'true' }, 'a')).toBe(true);
    expect(getBoolean({ a: '1' }, 'a')).toBe(true);
    expect(getBoolean({ a: 'false' }, 'a')).toBe(false);
  });

  it('normalizes optional strings by trimming empties to undefined', () => {
    expect(normalizeOptional(' hello ')).toBe('hello');
    expect(normalizeOptional('   ')).toBeUndefined();
    expect(normalizeOptional(null)).toBeUndefined();
  });
});
