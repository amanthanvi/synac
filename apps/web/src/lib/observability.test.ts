import { describe, expect, it } from 'vitest';

import { shouldAuditSearchIndexCoverage } from './observability';

describe('search observability', () => {
  it('skips search-index inspection for the hot autocomplete path', () => {
    expect(
      shouldAuditSearchIndexCoverage({
        page: 1,
        query: 'sa',
        durationMs: 20,
        resultsCount: 5,
      }),
    ).toBe(false);

    expect(
      shouldAuditSearchIndexCoverage({
        page: 1,
        query: 'saml',
        durationMs: 80,
        resultsCount: 3,
      }),
    ).toBe(false);
  });

  it('inspects coverage only for anomalous queries', () => {
    expect(
      shouldAuditSearchIndexCoverage({
        page: 1,
        query: 'authenitcation',
        durationMs: 320,
        resultsCount: 2,
      }),
    ).toBe(true);

    expect(
      shouldAuditSearchIndexCoverage({
        page: 1,
        query: 'authentication',
        durationMs: 55,
        resultsCount: 0,
      }),
    ).toBe(true);
  });

  it('never inspects coverage for later pagination pages', () => {
    expect(
      shouldAuditSearchIndexCoverage({
        page: 2,
        query: 'authentication',
        durationMs: 500,
        resultsCount: 0,
      }),
    ).toBe(false);
  });
});
