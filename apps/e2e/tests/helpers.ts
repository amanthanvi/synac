/**
 * Slugs and identifiers that the seeded dataset in `content/generated` is
 * known to contain. The suite only navigates to these, so a content change
 * that drops one of them fails here loudly instead of silently skipping.
 */
export const SEED = {
  /** TERM with eight or more senses, sourced from RFC 4949. */
  multiSenseTerm: 'domain',
  /** ACRONYM with three senses. */
  multiSenseAcronym: 'black',
  /** ACRONYM that also resolves as a term slug, so /term/2fa redirects. */
  redirectingAcronym: '2fa',
  /** Single-meaning TERM. */
  term: 'access-control',
  tag: 'identity-access',
  source: 'rfc4949',
  /** Query that matches several entries in the seeded dataset. */
  query: 'soc',
} as const;

export const ROUTES = {
  home: '/',
  search: `/search?q=${SEED.query}`,
  acronyms: '/acronyms',
  acronym: `/acronym/${SEED.multiSenseAcronym}`,
  term: `/term/${SEED.multiSenseTerm}`,
  sources: '/sources',
  tag: `/tags/${SEED.tag}`,
} as const;

/** Base URL the suite runs against, with no trailing slash. */
export function baseUrl(): string {
  const raw = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
  return raw.replace(/\/+$/, '');
}

export function apiUrl(path: string): string {
  return `${baseUrl()}${path}`;
}
