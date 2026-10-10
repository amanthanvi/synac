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
