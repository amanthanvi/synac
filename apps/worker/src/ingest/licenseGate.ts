type LicenseGateResult = {
  licenseGate: 'PASS' | 'WARN' | 'FAIL';
  licenseGateReason: string;
};

const STALE_VERIFICATION_DAYS = 180;

function daysBetween(a: Date, b: Date): number {
  const ms = Math.abs(a.getTime() - b.getTime());
  return ms / (1000 * 60 * 60 * 24);
}

export function evaluateLicenseGate(input: {
  licenseType: string;
  lastVerifiedAt: Date | null;
}): LicenseGateResult {
  const licenseTypeUpper = input.licenseType.toUpperCase();

  let licenseGate: LicenseGateResult['licenseGate'];
  const reasons: string[] = [];

  if (licenseTypeUpper === 'PUBLIC_DOMAIN' || licenseTypeUpper === 'CC0_1_0' || licenseTypeUpper === 'CC_BY_4_0') {
    licenseGate = 'PASS';
    reasons.push(`licenseType=${licenseTypeUpper} (allow)`);
  } else if (licenseTypeUpper === 'CC_BY_SA_4_0') {
    licenseGate = 'WARN';
    reasons.push(`licenseType=${licenseTypeUpper} (share-alike; review required)`);
  } else if (licenseTypeUpper === 'PROPRIETARY') {
    licenseGate = 'FAIL';
    reasons.push(`licenseType=${licenseTypeUpper} (blocked by default)`);
  } else {
    licenseGate = 'WARN';
    reasons.push(`licenseType=${licenseTypeUpper} (needs review)`);
  }

  if (!input.lastVerifiedAt) {
    if (licenseGate === 'PASS') licenseGate = 'WARN';
    reasons.push('source lastVerifiedAt missing');
  } else {
    const ageDays = daysBetween(new Date(), input.lastVerifiedAt);
    if (ageDays > STALE_VERIFICATION_DAYS) {
      if (licenseGate === 'PASS') licenseGate = 'WARN';
      reasons.push(`source verification stale (${Math.floor(ageDays)}d > ${STALE_VERIFICATION_DAYS}d)`);
    }
  }

  return { licenseGate, licenseGateReason: reasons.join('; ') };
}

