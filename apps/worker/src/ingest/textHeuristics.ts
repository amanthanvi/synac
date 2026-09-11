import { normalizeTitle, normalizeWhitespace } from '@synac/db';

import type { EntryType, VariantType } from './adapter.js';

export function normalizeMaxItems(value: number, fallback = 100): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(1000, Math.floor(value)));
}

export function inferVariantType(value: string): VariantType {
  const v = value.trim();
  if (!v) return 'ALIAS';
  if (v.includes(' ')) return 'SYNONYM';

  const compact = v.replace(/[.\-_/]/g, '');
  const isAllCaps =
    compact.length >= 2 &&
    compact === compact.toUpperCase() &&
    /[A-Z]/.test(compact) &&
    /^[A-Z0-9]+$/.test(compact);
  if (isAllCaps && v.length <= 24) return 'ABBREVIATION';

  return 'ALIAS';
}

export function inferEntryTypeFromTitle(
  value: string,
  options?: { maxLength?: number; acronymExpansion?: string },
): EntryType {
  const v = value.trim();
  if (!v) return 'TERM';

  if (options?.acronymExpansion?.trim()) {
    return v.includes(' ') ? 'TERM' : 'ACRONYM';
  }

  if (v.includes(' ')) return 'TERM';

  const maxLength = options?.maxLength ?? 24;
  if (v.length < 2 || v.length > maxLength) return 'TERM';

  const letters = v.replace(/[^A-Za-z]/g, '');
  if (letters.length < 1) return 'TERM';

  const uppercase = letters.replace(/[^A-Z]/g, '').length;
  const lowercase = letters.replace(/[^a-z]/g, '').length;
  const digits = v.replace(/[^0-9]/g, '').length;

  // Classic initialisms (AAD, TLS, AES, S/MIME, ...).
  if (uppercase >= 2 && lowercase <= 2) return 'ACRONYM';

  // Short forms like "C2" (Command and Control): one letter plus digits.
  if (uppercase >= 1 && digits >= 1 && letters.length <= 2 && lowercase === 0)
    return 'ACRONYM';

  return 'TERM';
}

/** Dedupes variant candidates and drops any that just repeat the title. */
export function buildVariants(
  candidates: string[],
  normalizedTitle: string,
): Array<{ variantText: string; variantType: VariantType }> {
  const out: Array<{ variantText: string; variantType: VariantType }> = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const text = normalizeWhitespace(candidate);
    if (!text) continue;
    const key = normalizeTitle(text);
    if (key === normalizedTitle || seen.has(key)) continue;
    seen.add(key);
    out.push({ variantText: text, variantType: inferVariantType(text) });
  }

  return out;
}

/** First paragraph, falling back to the whole text. */
export function firstParagraph(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const first = trimmed.split(/\n\s*\n/)[0]?.trim() ?? '';
  return first || trimmed;
}
