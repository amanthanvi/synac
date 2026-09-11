import { describe, expect, it } from 'vitest';

import { normalizeOptional } from './index.js';

describe('@synac/shared', () => {
  it('normalizeOptional trims or drops empty', () => {
    expect(normalizeOptional('  hi  ')).toBe('hi');
    expect(normalizeOptional('')).toBeUndefined();
    expect(normalizeOptional(undefined)).toBeUndefined();
  });
});
