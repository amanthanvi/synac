export function getString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value : '';
}

export function getNumber(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  return typeof value === 'number' ? value : Number(value);
}

export function getBoolean(
  body: Record<string, unknown>,
  key: string,
): boolean {
  const value = body[key];
  if (typeof value === 'boolean') return value;
  const normalized = typeof value === 'string' ? value : String(value ?? '');
  return (
    normalized.trim().toLowerCase() === 'true' || normalized.trim() === '1'
  );
}

export function normalizeOptional(
  value: string | null | undefined,
): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

/**
 * Anchor id for a sense heading, safe for URLs and CSS selectors. Convex
 * search returns the same value so a result can link straight to the meaning;
 * keep the two in step.
 */
export function senseAnchorId(senseKey: string): string {
  return `sense-${senseKey.replace(/[^a-zA-Z0-9-]+/g, '-')}`;
}
