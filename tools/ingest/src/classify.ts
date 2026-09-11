/**
 * Shared term/acronym heuristics for every adapter.
 *
 * One length rule governs every short form: a compact initialism is 2..32
 * characters with no whitespace, so adapters cannot drift apart on what counts
 * as an acronym.
 */
const MIN_SHORT_FORM_LENGTH = 2;
const MAX_SHORT_FORM_LENGTH = 32;

/** True for compact all-caps or alphanumeric short forms such as "TLS", "S/MIME", "2FA". */
export function isInitialism(value: string): boolean {
  const v = value.trim();
  if (!v || /\s/.test(v)) return false;
  if (v.length < MIN_SHORT_FORM_LENGTH || v.length > MAX_SHORT_FORM_LENGTH)
    return false;

  const letters = v.replace(/[^A-Za-z]/g, '');
  if (letters.length < 1) return false;

  const uppercase = letters.replace(/[^A-Z]/g, '').length;
  const lowercase = letters.replace(/[^a-z]/g, '').length;
  const digits = v.replace(/[^0-9]/g, '').length;

  // Classic initialisms (AAD, TLS, AES, S/MIME).
  if (uppercase >= 2 && lowercase <= 2) return true;

  // Short forms like "C2" (Command and Control) have one letter plus digits.
  if (uppercase >= 1 && digits >= 1 && letters.length <= 2 && lowercase === 0)
    return true;

  return false;
}

export function classifyEntryType(title: string): 'TERM' | 'ACRONYM' {
  return isInitialism(title) ? 'ACRONYM' : 'TERM';
}

export function classifyVariantType(
  value: string,
): 'ALIAS' | 'SYNONYM' | 'ABBREVIATION' {
  const v = value.trim();
  if (!v) return 'ALIAS';
  if (v.includes(' ')) return 'SYNONYM';

  const compact = v.replace(/[.\-_/]/g, '');
  const isAllCaps =
    compact.length >= MIN_SHORT_FORM_LENGTH &&
    compact === compact.toUpperCase() &&
    /[A-Z]/.test(compact) &&
    /^[A-Z0-9]+$/.test(compact);
  if (isAllCaps && v.length <= MAX_SHORT_FORM_LENGTH) return 'ABBREVIATION';

  return 'ALIAS';
}

/** True when `variant` is the first-letter initialism of a multi-word `title`. */
export function isInitialismOf(variant: string, title: string): boolean {
  const words = title
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z0-9]/g, ''))
    .filter(Boolean);
  if (words.length < 2) return false;

  const initials = words
    .map((word) => word[0])
    .join('')
    .toLowerCase();
  const compact = variant.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  return compact.length >= MIN_SHORT_FORM_LENGTH && compact === initials;
}
