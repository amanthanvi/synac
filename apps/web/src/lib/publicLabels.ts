/** Human-readable labels for enum values shown on the public surface. */

const LICENSE_TYPE_LABELS: Record<string, string> = {
  PUBLIC_DOMAIN: 'Public domain',
  CC_BY_4_0: 'CC BY 4.0',
  CC_BY_SA_4_0: 'CC BY-SA 4.0',
  CC0_1_0: 'CC0 1.0',
  PROPRIETARY: 'Proprietary',
  OTHER: 'Other',
};

const TRUST_TIER_LABELS: Record<string, string> = {
  TIER_1: 'Tier 1: standards bodies',
  TIER_2: 'Tier 2: government and academia',
  TIER_3: 'Tier 3: vendor and industry',
  TIER_4: 'Tier 4: community',
};

const TRUST_TIER_SHORT_LABELS: Record<string, string> = {
  TIER_1: 'Tier 1',
  TIER_2: 'Tier 2',
  TIER_3: 'Tier 3',
  TIER_4: 'Tier 4',
};

const CONTENT_MODE_LABELS: Record<string, string> = {
  QUOTED: 'Quoted',
  SUMMARIZED: 'Summarized',
  PARAPHRASED: 'Paraphrased',
};

const EXTRACTION_METHOD_LABELS: Record<string, string> = {
  API: 'API',
  RSS: 'RSS feed',
  HTML: 'HTML page',
  PDF: 'PDF document',
  MANUAL: 'Manual entry',
};

/** Fallback for unknown enum members: `SOME_VALUE` -> `Some value`. */
function humanizeEnum(value: string): string {
  const spaced = value.replace(/_/g, ' ').toLowerCase().trim();
  if (!spaced) return value;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function formatLicenseType(value: string): string {
  return LICENSE_TYPE_LABELS[value] ?? humanizeEnum(value);
}

export function formatTrustTier(value: string): string {
  return TRUST_TIER_LABELS[value] ?? humanizeEnum(value);
}

export function formatTrustTierShort(value: string): string {
  return TRUST_TIER_SHORT_LABELS[value] ?? humanizeEnum(value);
}

export function formatContentMode(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  return CONTENT_MODE_LABELS[value] ?? humanizeEnum(value);
}

export function formatExtractionMethod(value: string): string {
  return EXTRACTION_METHOD_LABELS[value] ?? humanizeEnum(value);
}

/**
 * Ranking for the concordance "specificity" badge: Tier 1 outranks Tier 2, and
 * anything unrecognised sorts last.
 */
export function trustTierRank(value: string): number {
  const match = /^TIER_(\d+)$/.exec(value);
  if (!match?.[1]) return Number.MAX_SAFE_INTEGER;
  return Number.parseInt(match[1], 10);
}
