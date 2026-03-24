import { describe, expect, it } from 'vitest';

import { parseProposedChange } from './types.js';

describe('promotion proposed change parsing', () => {
  it('preserves variants on create-entry payloads', () => {
    const parsed = parseProposedChange({
      kind: 'CREATE_ENTRY',
      entryType: 'ACRONYM',
      displayTitle: 'SAML',
      summaryMd: 'Summary',
      variants: [
        { variantText: 'Security Assertion Markup Language', variantType: 'SYNONYM' },
        { variantText: ' SAML ', variantType: 'ABBREVIATION' },
      ],
      senses: [{ definitionMd: 'Definition' }],
    });

    expect(parsed.kind).toBe('CREATE_ENTRY');
    expect(parsed.variants).toEqual([
      {
        variantText: 'Security Assertion Markup Language',
        variantType: 'SYNONYM',
      },
      {
        variantText: 'SAML',
        variantType: 'ABBREVIATION',
      },
    ]);
  });

  it('preserves variants on add-senses payloads', () => {
    const parsed = parseProposedChange({
      kind: 'ADD_SENSES',
      entryId: 'entry-1',
      entryType: 'TERM',
      displayTitle: 'Authentication',
      variants: [{ variantText: 'AuthN', variantType: 'ABBREVIATION' }],
      senses: [{ definitionMd: 'Definition' }],
    });

    expect(parsed.kind).toBe('ADD_SENSES');
    expect(parsed.variants).toEqual([
      {
        variantText: 'AuthN',
        variantType: 'ABBREVIATION',
      },
    ]);
  });
});
