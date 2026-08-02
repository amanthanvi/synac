import { describe, expect, it } from 'vitest';

import { overrideFileSchema } from './model.js';

describe('ISO date validation', () => {
  it('accepts valid calendar dates, including leap days', () => {
    expect(overrideFileSchema.parse({ updatedAt: '2024-02-29' }).updatedAt).toBe('2024-02-29');
  });

  it.each(['2026-02-29', '2026-04-31', '2026-99-99'])(
    'rejects the impossible calendar date %s',
    (updatedAt) => {
      expect(() => overrideFileSchema.parse({ updatedAt })).toThrow('must be a valid calendar date');
    },
  );
});
