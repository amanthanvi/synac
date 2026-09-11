import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  evaluateLicenseGate,
  VERBATIM_AGAINST_POLICY_REASON,
} from './licenseGate.js';

const NOW = new Date('2026-09-10T00:00:00.000Z');

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

describe('evaluateLicenseGate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('license type', () => {
    it.each(['PUBLIC_DOMAIN', 'CC0_1_0', 'CC_BY_4_0'])(
      'passes %s',
      (licenseType) => {
        const result = evaluateLicenseGate({
          licenseType,
          lastVerifiedAt: daysAgo(1),
        });
        expect(result.licenseGate).toBe('PASS');
        expect(result.licenseGateReason).toContain(
          `licenseType=${licenseType} (allow)`,
        );
      },
    );

    it('warns on share-alike', () => {
      const result = evaluateLicenseGate({
        licenseType: 'CC_BY_SA_4_0',
        lastVerifiedAt: daysAgo(1),
      });
      expect(result.licenseGate).toBe('WARN');
      expect(result.licenseGateReason).toContain('share-alike');
    });

    it('fails proprietary', () => {
      const result = evaluateLicenseGate({
        licenseType: 'PROPRIETARY',
        lastVerifiedAt: daysAgo(1),
      });
      expect(result.licenseGate).toBe('FAIL');
    });

    it('warns on an unrecognised license type', () => {
      const result = evaluateLicenseGate({
        licenseType: 'OTHER',
        lastVerifiedAt: daysAgo(1),
      });
      expect(result.licenseGate).toBe('WARN');
      expect(result.licenseGateReason).toContain('needs review');
    });

    it('is case-insensitive on the license type', () => {
      expect(
        evaluateLicenseGate({
          licenseType: 'public_domain',
          lastVerifiedAt: daysAgo(1),
        }).licenseGate,
      ).toBe('PASS');
    });
  });

  describe('verification freshness', () => {
    it('warns when lastVerifiedAt is missing', () => {
      const result = evaluateLicenseGate({
        licenseType: 'PUBLIC_DOMAIN',
        lastVerifiedAt: null,
      });
      expect(result.licenseGate).toBe('WARN');
      expect(result.licenseGateReason).toContain('lastVerifiedAt missing');
    });

    it('passes at exactly the 180-day boundary', () => {
      const result = evaluateLicenseGate({
        licenseType: 'PUBLIC_DOMAIN',
        lastVerifiedAt: daysAgo(180),
      });
      expect(result.licenseGate).toBe('PASS');
      expect(result.licenseGateReason).not.toContain('stale');
    });

    it('warns just past the 180-day boundary', () => {
      const result = evaluateLicenseGate({
        licenseType: 'PUBLIC_DOMAIN',
        lastVerifiedAt: daysAgo(180.5),
      });
      expect(result.licenseGate).toBe('WARN');
      expect(result.licenseGateReason).toContain('stale');
    });

    it('does not downgrade a FAIL to WARN when also stale', () => {
      const result = evaluateLicenseGate({
        licenseType: 'PROPRIETARY',
        lastVerifiedAt: daysAgo(400),
      });
      expect(result.licenseGate).toBe('FAIL');
      expect(result.licenseGateReason).toContain('stale');
    });
  });

  describe('content mode', () => {
    it('fails QUOTED + PROPRIETARY with a verbatim-specific reason', () => {
      const result = evaluateLicenseGate({
        licenseType: 'PROPRIETARY',
        lastVerifiedAt: daysAgo(1),
        contentMode: 'QUOTED',
        defaultContentMode: 'QUOTED',
      });
      expect(result.licenseGate).toBe('FAIL');
      expect(result.licenseGateReason).toContain(
        'verbatim reproduction blocked',
      );
    });

    it('warns on QUOTED + OTHER', () => {
      const result = evaluateLicenseGate({
        licenseType: 'OTHER',
        lastVerifiedAt: daysAgo(1),
        contentMode: 'QUOTED',
        defaultContentMode: 'QUOTED',
      });
      expect(result.licenseGate).toBe('WARN');
      expect(result.licenseGateReason).toContain(
        'contentMode=QUOTED with licenseType=OTHER',
      );
    });

    it('warns on QUOTED + CC_BY_SA_4_0', () => {
      const result = evaluateLicenseGate({
        licenseType: 'CC_BY_SA_4_0',
        lastVerifiedAt: daysAgo(1),
        contentMode: 'QUOTED',
        defaultContentMode: 'QUOTED',
      });
      expect(result.licenseGate).toBe('WARN');
      expect(result.licenseGateReason).toContain(
        'contentMode=QUOTED with licenseType=CC_BY_SA_4_0',
      );
    });

    it('warns when QUOTED text comes from a source whose policy prefers summarization', () => {
      const result = evaluateLicenseGate({
        licenseType: 'PUBLIC_DOMAIN',
        lastVerifiedAt: daysAgo(1),
        contentMode: 'QUOTED',
        defaultContentMode: 'SUMMARIZED',
      });
      expect(result.licenseGate).toBe('WARN');
      expect(result.licenseGateReason).toContain(
        VERBATIM_AGAINST_POLICY_REASON,
      );
    });

    it('also warns when the policy is PARAPHRASED', () => {
      const result = evaluateLicenseGate({
        licenseType: 'CC_BY_4_0',
        lastVerifiedAt: daysAgo(1),
        contentMode: 'QUOTED',
        defaultContentMode: 'PARAPHRASED',
      });
      expect(result.licenseGate).toBe('WARN');
      expect(result.licenseGateReason).toContain(
        VERBATIM_AGAINST_POLICY_REASON,
      );
    });

    it('passes QUOTED when the source policy is also QUOTED and the license allows it', () => {
      const result = evaluateLicenseGate({
        licenseType: 'PUBLIC_DOMAIN',
        lastVerifiedAt: daysAgo(1),
        contentMode: 'QUOTED',
        defaultContentMode: 'QUOTED',
      });
      expect(result.licenseGate).toBe('PASS');
      expect(result.licenseGateReason).not.toContain(
        VERBATIM_AGAINST_POLICY_REASON,
      );
    });

    it('does not apply content-mode rules to non-QUOTED items', () => {
      const result = evaluateLicenseGate({
        licenseType: 'PUBLIC_DOMAIN',
        lastVerifiedAt: daysAgo(1),
        contentMode: 'SUMMARIZED',
        defaultContentMode: 'QUOTED',
      });
      expect(result.licenseGate).toBe('PASS');
    });

    it('ignores unrecognised content-mode strings', () => {
      const result = evaluateLicenseGate({
        licenseType: 'PUBLIC_DOMAIN',
        lastVerifiedAt: daysAgo(1),
        contentMode: 'NONSENSE',
        defaultContentMode: 'NONSENSE',
      });
      expect(result.licenseGate).toBe('PASS');
    });

    it('stays backward compatible when content modes are omitted', () => {
      const result = evaluateLicenseGate({
        licenseType: 'CC_BY_4_0',
        lastVerifiedAt: daysAgo(10),
      });
      expect(result).toEqual({
        licenseGate: 'PASS',
        licenseGateReason: 'licenseType=CC_BY_4_0 (allow)',
      });
    });
  });
});
