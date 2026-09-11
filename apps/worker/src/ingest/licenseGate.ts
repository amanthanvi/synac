export type LicenseGateVerdict = 'PASS' | 'WARN' | 'FAIL';

export type LicenseGateResult = {
  licenseGate: LicenseGateVerdict;
  licenseGateReason: string;
};

export type LicenseGateInput = {
  licenseType: string;
  lastVerifiedAt: Date | null;
  /** How this item's text is actually stored. */
  contentMode?: string;
  /** The source's declared policy (`Source.defaultContentMode`). */
  defaultContentMode?: string;
};

const STALE_VERIFICATION_DAYS = 180;

/**
 * Reason emitted when an adapter only has verbatim text but the source's policy
 * asks for summarization. The item is stored QUOTED (the attestation must stay
 * faithful) and routed to review rather than dropped.
 */
export const VERBATIM_AGAINST_POLICY_REASON =
  'verbatim text from a source whose policy prefers summarization';

function daysBetween(a: Date, b: Date): number {
  const ms = Math.abs(a.getTime() - b.getTime());
  return ms / (1000 * 60 * 60 * 24);
}

function escalate(
  current: LicenseGateVerdict,
  next: LicenseGateVerdict,
): LicenseGateVerdict {
  if (current === 'FAIL' || next === 'FAIL') return 'FAIL';
  if (current === 'WARN' || next === 'WARN') return 'WARN';
  return 'PASS';
}

function normalizeContentMode(
  value: string | undefined,
): 'QUOTED' | 'SUMMARIZED' | 'PARAPHRASED' | null {
  const v = value?.trim().toUpperCase();
  if (v === 'QUOTED' || v === 'SUMMARIZED' || v === 'PARAPHRASED') return v;
  return null;
}

export function evaluateLicenseGate(
  input: LicenseGateInput,
): LicenseGateResult {
  const licenseTypeUpper = input.licenseType.toUpperCase();

  let licenseGate: LicenseGateVerdict;
  const reasons: string[] = [];

  if (
    licenseTypeUpper === 'PUBLIC_DOMAIN' ||
    licenseTypeUpper === 'CC0_1_0' ||
    licenseTypeUpper === 'CC_BY_4_0'
  ) {
    licenseGate = 'PASS';
    reasons.push(`licenseType=${licenseTypeUpper} (allow)`);
  } else if (licenseTypeUpper === 'CC_BY_SA_4_0') {
    licenseGate = 'WARN';
    reasons.push(
      `licenseType=${licenseTypeUpper} (share-alike; review required)`,
    );
  } else if (licenseTypeUpper === 'PROPRIETARY') {
    licenseGate = 'FAIL';
    reasons.push(`licenseType=${licenseTypeUpper} (blocked by default)`);
  } else {
    licenseGate = 'WARN';
    reasons.push(`licenseType=${licenseTypeUpper} (needs review)`);
  }

  if (!input.lastVerifiedAt) {
    licenseGate = escalate(licenseGate, 'WARN');
    reasons.push('source lastVerifiedAt missing');
  } else {
    const ageDays = daysBetween(new Date(), input.lastVerifiedAt);
    if (ageDays > STALE_VERIFICATION_DAYS) {
      licenseGate = escalate(licenseGate, 'WARN');
      reasons.push(
        `source verification stale (${Math.floor(ageDays)}d > ${STALE_VERIFICATION_DAYS}d)`,
      );
    }
  }

  // Content-mode rules. Reproducing a source verbatim is the risky case, so the
  // gate only tightens when this item is stored QUOTED.
  const contentMode = normalizeContentMode(input.contentMode);
  const defaultContentMode = normalizeContentMode(input.defaultContentMode);

  if (contentMode === 'QUOTED') {
    if (licenseTypeUpper === 'PROPRIETARY') {
      licenseGate = escalate(licenseGate, 'FAIL');
      reasons.push(
        'contentMode=QUOTED with a proprietary license (verbatim reproduction blocked)',
      );
    } else if (
      licenseTypeUpper === 'OTHER' ||
      licenseTypeUpper.startsWith('CC_BY_SA')
    ) {
      licenseGate = escalate(licenseGate, 'WARN');
      reasons.push(
        `contentMode=QUOTED with licenseType=${licenseTypeUpper} (review required)`,
      );
    }

    if (defaultContentMode && defaultContentMode !== 'QUOTED') {
      licenseGate = escalate(licenseGate, 'WARN');
      reasons.push(VERBATIM_AGAINST_POLICY_REASON);
    }
  }

  return { licenseGate, licenseGateReason: reasons.join('; ') };
}
