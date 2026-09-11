/**
 * Date formatting for the public surface. One implementation, used everywhere.
 *
 * Values arrive either as `Date` (straight from Prisma) or as ISO strings
 * (anything that has been through `unstable_cache`, which JSON round-trips its
 * payload), so every helper accepts both.
 */

export type DateLike = Date | string;

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  timeZone: 'UTC',
});

function toDate(value: DateLike): Date {
  return value instanceof Date ? value : new Date(value);
}

/** ISO-8601 string, for `<time dateTime>` and structured data. */
export function toIsoString(value: DateLike): string {
  return toDate(value).toISOString();
}

/** e.g. `Mar 04, 2026`. Formatted in UTC so server and client agree. */
export function formatDate(value: DateLike): string {
  return DATE_FORMAT.format(toDate(value));
}

/** Coarse "time ago" label. `now` is explicit so callers stay deterministic. */
export function formatRelativeDate(value: DateLike, now: DateLike): string {
  const diffMs = toDate(now).getTime() - toDate(value).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 7) return `${diffDays} days ago`;

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks === 1) return '1 week ago';
  if (diffWeeks < 5) return `${diffWeeks} weeks ago`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return '1 month ago';
  if (diffMonths < 12) return `${diffMonths} months ago`;

  const diffYears = Math.floor(diffDays / 365);
  return diffYears <= 1 ? '1 year ago' : `${diffYears} years ago`;
}

/** Short prefix of a content hash, for provenance display. */
export function shortHash(value: string, length = 12): string {
  const trimmed = value.trim();
  if (trimmed.length <= length) return trimmed;
  return trimmed.slice(0, length);
}
