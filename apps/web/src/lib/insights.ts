/**
 * Vercel's measurement scripts report `location.href`. Dropping the query
 * string keeps what readers type into search (`/search?q=…`) out of those
 * reports, as the privacy policy promises. A `?` inside the fragment is part
 * of the fragment, so the fragment is split off first and kept.
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
