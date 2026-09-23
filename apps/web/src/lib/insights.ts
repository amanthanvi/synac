/**
 * Vercel's measurement scripts report `location.href`. Dropping the query
 * string keeps what readers type into search (`/search?q=…`) out of the
 * reported page address. A `?` inside the fragment is part of the fragment,
 * so the fragment is split off first and kept.
 */
export function withoutQueryString<T extends { url: string }>(event: T): T {
  const hashStart = event.url.indexOf('#');
  const beforeHash =
    hashStart === -1 ? event.url : event.url.slice(0, hashStart);
  const queryStart = beforeHash.indexOf('?');
  if (queryStart === -1) return event;

  const hash = hashStart === -1 ? '' : event.url.slice(hashStart);
  return { ...event, url: beforeHash.slice(0, queryStart) + hash };
}

function sendsGlobalPrivacyControl(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'globalPrivacyControl' in navigator &&
    navigator.globalPrivacyControl === true
  );
}

/**
 * A browser that sends Global Privacy Control is not measured, and every other
 * report loses its query string. Returning `null` drops the report.
 */
export function prepareInsightsEvent<T extends { url: string }>(
  event: T,
  globalPrivacyControl: boolean,
): T | null {
  return globalPrivacyControl ? null : withoutQueryString(event);
}

/** `beforeSend` for Vercel Web Analytics and Speed Insights. */
export function beforeInsightsSend<T extends { url: string }>(
  event: T,
): T | null {
  return prepareInsightsEvent(event, sendsGlobalPrivacyControl());
}
