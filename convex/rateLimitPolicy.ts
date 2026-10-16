/**
 * Per-caller fixed-window budgets, in requests per minute.
 *
 * The names are independent limiter entries: spending one does not spend
 * another. Windows stay fixed on purpose. A token bucket, a burst allowance,
 * and skipping cache hits belong to a later change.
 *
 * search: the palette debounces at 150ms and the /search page issues one
 * request per navigation. 120/min is two requests a second for a full minute,
 * which covers a fast typist refining queries without matching the debounce
 * ceiling.
 * api_read: listings, entry lookups, export, sources, citations, and the
 * OpenAPI document. This keeps the previous programmatic budget of 60/min,
 * now uncontended by search or CSP reports.
 * csp_report: browsers send a handful of violation reports per page. 30/min
 * absorbs a noisy document and caps log flooding.
 */
export const RATE_LIMIT_PER_MINUTE = {
  search: 120,
  api_read: 60,
  csp_report: 30,
} as const;

export type RateLimitScope = keyof typeof RATE_LIMIT_PER_MINUTE;

/**
 * Scope the previous web deploy sends for every route. The mutation still
 * accepts it, on its own window, so a Convex deploy and a Vercel deploy can
 * land in either order. The web client falls back to it when a backend
 * rejects the split names. It does not share a counter with the scopes above.
 * Remove it once no deployed server sends it.
 */
export const LEGACY_SHARED_SCOPE = 'api_v1_search' as const;
export const LEGACY_SHARED_PER_MINUTE = 60;
