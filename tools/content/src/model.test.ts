import { describe, expect, it } from 'vitest';

import { overrideFileSchema, sourceFileSchema } from './model.js';

describe('ISO date validation', () => {
  it('accepts valid calendar dates, including leap days', () => {
    expect(
      overrideFileSchema.parse({ updatedAt: '2024-02-29' }).updatedAt,
    ).toBe('2024-02-29');
  });

  it.each(['2026-02-29', '2026-04-31', '2026-99-99'])(
    'rejects the impossible calendar date %s',
    (updatedAt) => {
      expect(() => overrideFileSchema.parse({ updatedAt })).toThrow(
        'must be a valid calendar date',
      );
    },
  );
});

function nistSource(maxItems: number) {
  return {
    slug: 'nist-csrc-glossary',
    name: 'NIST CSRC Glossary',
    baseUrl: 'https://csrc.nist.gov/glossary',
    license: {
      type: 'US_GOV_PD',
      allowedUse: 'Reproduce definitions with citation.',
      attributionRequirements: 'NIST CSRC Glossary',
    },
    accessMethod: 'HTML',
    trustTier: 'TIER1',
    enabled: true,
    ingest: {
      adapter: 'nistGlossary',
      schedule: 'weekly',
      maxItems,
    },
    lastVerifiedAt: '2026-02-10',
  };
}

describe('source ingest limits', () => {
  it('allows the explicit NIST ceiling above the default ingest limit', () => {
    expect(sourceFileSchema.parse(nistSource(15_000)).ingest?.maxItems).toBe(
      15_000,
    );
  });

  it('retains a hard upper bound for source configuration', () => {
    expect(sourceFileSchema.safeParse(nistSource(20_001)).success).toBe(false);
  });
});
