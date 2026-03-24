import { describe, expect, it } from 'vitest';

import { workerOk } from './worker.js';

function getIngestSkipReason(input: {
  sourceExists: boolean;
  enabled: boolean;
  hasAllowedUse: boolean;
  hasAttributionRequirements: boolean;
  isVerified: boolean;
  hasRunningIngestRun: boolean;
}):
  | 'source_not_found'
  | 'source_disabled'
  | 'missing_allowed_use'
  | 'missing_attribution_requirements'
  | 'source_unverified'
  | 'run_already_running'
  | null {
  if (!input.sourceExists) return 'source_not_found';
  if (!input.enabled) return 'source_disabled';
  if (!input.hasAllowedUse) return 'missing_allowed_use';
  if (!input.hasAttributionRequirements) return 'missing_attribution_requirements';
  if (!input.isVerified) return 'source_unverified';
  if (input.hasRunningIngestRun) return 'run_already_running';
  return null;
}

describe('worker smoke', () => {
  it('exports workerOk', () => {
    expect(workerOk).toBe(true);
  });

  it('derives structured ingest skip reasons', () => {
    expect(
      getIngestSkipReason({
        sourceExists: false,
        enabled: true,
        hasAllowedUse: true,
        hasAttributionRequirements: true,
        isVerified: true,
        hasRunningIngestRun: false,
      }),
    ).toBe('source_not_found');

    expect(
      getIngestSkipReason({
        sourceExists: true,
        enabled: false,
        hasAllowedUse: true,
        hasAttributionRequirements: true,
        isVerified: true,
        hasRunningIngestRun: false,
      }),
    ).toBe('source_disabled');

    expect(
      getIngestSkipReason({
        sourceExists: true,
        enabled: true,
        hasAllowedUse: true,
        hasAttributionRequirements: true,
        isVerified: true,
        hasRunningIngestRun: true,
      }),
    ).toBe('run_already_running');
  });
});
