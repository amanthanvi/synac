import { describe, expect, it } from 'vitest';

import { extractNormalizedProposedChange } from './importRuns.js';

describe('promotion import run helpers', () => {
  it('prefers normalized proposed change from stage outputs', () => {
    const proposedChange = extractNormalizedProposedChange({
      proposedChange: {
        kind: 'CREATE_ENTRY',
        displayTitle: 'Fallback',
      },
      stageOutputs: {
        normalized: {
          proposedChange: {
            kind: 'ADD_SENSES',
            entryId: 'entry-1',
            entryType: 'TERM',
            displayTitle: 'Primary',
            senses: [{ definitionMd: 'Definition' }],
          },
        },
      },
    });

    expect(proposedChange).toEqual({
      kind: 'ADD_SENSES',
      entryId: 'entry-1',
      entryType: 'TERM',
      displayTitle: 'Primary',
      senses: [{ definitionMd: 'Definition' }],
    });
  });

  it('falls back to ingest item proposed change when stage outputs are absent', () => {
    const proposedChange = extractNormalizedProposedChange({
      proposedChange: {
        kind: 'CREATE_ENTRY',
        entryType: 'TERM',
        displayTitle: 'Authentication',
        senses: [{ definitionMd: 'Definition' }],
      },
      stageOutputs: null,
    });

    expect(proposedChange).toEqual({
      kind: 'CREATE_ENTRY',
      entryType: 'TERM',
      displayTitle: 'Authentication',
      senses: [{ definitionMd: 'Definition' }],
    });
  });

  it('returns null when neither location contains a valid proposed change', () => {
    const proposedChange = extractNormalizedProposedChange({
      proposedChange: { foo: 'bar' },
      stageOutputs: { normalized: { proposedChange: { foo: 'bar' } } },
    });

    expect(proposedChange).toBeNull();
  });
});
