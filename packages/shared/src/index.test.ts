import { describe, expect, it } from 'vitest';

import { getBoolean, getNumber, getString, normalizeOptional } from './index.js';

describe('@synac/shared', () => {
  it('getString returns string fields', () => {
    expect(getString({ a: 'x' }, 'a')).toBe('x');
    expect(getString({ a: 1 }, 'a')).toBe('');
  });

  it('getNumber coerces numbers', () => {
    expect(getNumber({ n: 3 }, 'n')).toBe(3);
    expect(getNumber({ n: '4' }, 'n')).toBe(4);
  });

  it('getBoolean parses booleans', () => {
    expect(getBoolean({ b: true }, 'b')).toBe(true);
    expect(getBoolean({ b: 'false' }, 'b')).toBe(false);
  });

  it('normalizeOptional trims or drops empty', () => {
    expect(normalizeOptional('  hi  ')).toBe('hi');
    expect(normalizeOptional('')).toBeUndefined();
    expect(normalizeOptional(undefined)).toBeUndefined();
  });
});
