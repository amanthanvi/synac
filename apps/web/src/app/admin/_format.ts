/**
 * Date formatting for the admin surface. Unlike `lib/publicFormat`, these run
 * in the server's local zone: admins are reading operational timestamps, not
 * published content, so "when did this run" should match their wall clock.
 */

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
});

export function formatDateTime(value: Date): string {
  return DATE_TIME_FORMAT.format(value);
}

/** Renders a dash placeholder when there is no date. */
export function formatDate(value: Date | null): string {
  return value ? DATE_FORMAT.format(value) : '—';
}
