import { describe, expect, it } from 'vitest';

import { getBoolean, getNumber, getString, normalizeOptional } from '@synac/shared';

describe('admin api route shared parsing', () => {
  it('reuses string and boolean coercion consistently', () => {
    expect(getString({ name: 'source' }, 'name')).toBe('source');
    expect(getString({ name: 12 }, 'name')).toBe('');

    expect(getBoolean({ enabled: true }, 'enabled')).toBe(true);
    expect(getBoolean({ enabled: '1' }, 'enabled')).toBe(true);
    expect(getBoolean({ enabled: 'true' }, 'enabled')).toBe(true);
    expect(getBoolean({ enabled: 'false' }, 'enabled')).toBe(false);
  });

  it('normalizes optional request ids and numeric params', () => {
    expect(normalizeOptional('  req-123  ')).toBe('req-123');
    expect(normalizeOptional('   ')).toBeUndefined();

    expect(getNumber({ limit: '250' }, 'limit')).toBe(250);
    expect(getNumber({ limit: 40 }, 'limit')).toBe(40);
  });
});
