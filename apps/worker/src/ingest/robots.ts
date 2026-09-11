import { safeFetch } from '../net/safeFetch.js';

export type RobotsRules = {
  allow: string[];
  disallow: string[];
};

type RobotsCacheEntry =
  | { kind: 'rules'; rules: RobotsRules }
  | { kind: 'unavailable'; reason: string };

/** Per-origin cache so robots.txt is fetched at most once per host per process. */
const robotsCache = new Map<string, RobotsCacheEntry>();

const DEFAULT_TIMEOUT_MS = 10_000;
const ROBOTS_MAX_BYTES = 512 * 1024;

/** Test seam: clears the per-origin cache. */
export function clearRobotsCache(): void {
  robotsCache.clear();
}

type Directive = { name: string; value: string };

function parseLine(rawLine: string): Directive | null {
  const withoutComment = rawLine.split('#', 1)[0] ?? '';
  const line = withoutComment.trim();
  if (!line) return null;

  const colon = line.indexOf(':');
  if (colon === -1) return null;

  const name = line.slice(0, colon).trim().toLowerCase();
  const value = line.slice(colon + 1).trim();
  if (!name) return null;

  return { name, value };
}

/**
 * Parses robots.txt, honouring only the `User-agent: *` group (plus an exact,
 * case-insensitive match on `userAgent` when supplied, which takes precedence over `*`).
 *
 * Consecutive `User-agent:` lines form one group; the rules that follow apply to every
 * agent named immediately before them. `Crawl-delay`, `Sitemap` and unknown directives
 * are ignored.
 */
export function parseRobotsTxt(text: string, userAgent?: string): RobotsRules {
  const wildcard: RobotsRules = { allow: [], disallow: [] };
  const named: RobotsRules = { allow: [], disallow: [] };
  const wantedAgent = userAgent?.trim().toLowerCase();

  // Agents named by the group currently being read.
  let currentAgents: string[] = [];
  // Whether the file declared a group for the requested user-agent at all (a group that only
  // says `Disallow:` is still an override of `*`, even though it yields no rules).
  let namedAgentSeen = false;
  // True while we are still consuming the `User-agent:` header block of a group; the next
  // rule line closes the header, and a `User-agent:` line after a rule starts a new group.
  let collectingAgents = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const directive = parseLine(rawLine);
    if (!directive) continue;

    if (directive.name === 'user-agent') {
      if (!collectingAgents) {
        currentAgents = [];
        collectingAgents = true;
      }
      const agent = directive.value.trim().toLowerCase();
      currentAgents.push(agent);
      if (wantedAgent && agent === wantedAgent) namedAgentSeen = true;
      continue;
    }

    if (directive.name !== 'allow' && directive.name !== 'disallow') {
      // Crawl-delay, Sitemap, Host, unknown extensions: ignored, and they do not close a group.
      continue;
    }

    collectingAgents = false;
    if (currentAgents.length === 0) continue;

    const targets: RobotsRules[] = [];
    if (currentAgents.includes('*')) targets.push(wildcard);
    if (wantedAgent && currentAgents.includes(wantedAgent)) targets.push(named);
    if (targets.length === 0) continue;

    for (const target of targets) {
      if (directive.name === 'allow') {
        if (directive.value) target.allow.push(directive.value);
      } else {
        // `Disallow:` with an empty value means "allow everything" and contributes no rule.
        if (directive.value) target.disallow.push(directive.value);
      }
    }
  }

  return namedAgentSeen ? named : wildcard;
}

/**
 * Matches a robots rule pattern against a pathname.
 *
 * Supported syntax: plain prefix matching, `*` as a wildcard for any run of characters
 * (anywhere in the pattern), and a trailing `$` as an end-of-path anchor. Nothing is
 * percent-decoded on either side; matching is byte-for-byte on the raw pathname.
 *
 * Returns the pattern's match length (used for longest-match arbitration) or -1 for no match.
 */
function matchLength(pattern: string, pathname: string): number {
  if (!pattern) return -1;

  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;

  if (!body.includes('*')) {
    if (anchored) return pathname === body ? body.length : -1;
    return pathname.startsWith(body) ? body.length : -1;
  }

  const segments = body.split('*');
  let cursor = 0;
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i] ?? '';
    if (i === 0) {
      if (!pathname.startsWith(segment)) return -1;
      cursor = segment.length;
      continue;
    }
    if (segment === '') continue;
    const found = pathname.indexOf(segment, cursor);
    if (found === -1) return -1;
    cursor = found + segment.length;
  }

  const lastSegment = segments[segments.length - 1] ?? '';
  if (anchored) {
    if (lastSegment === '') return body.length;
    return pathname.endsWith(lastSegment) ? body.length : -1;
  }

  return body.length;
}

/**
 * Longest-match wins; an Allow rule of equal-or-greater length beats a Disallow.
 * A path with no matching Disallow is allowed.
 */
export function isPathAllowedByRules(
  rules: RobotsRules,
  pathname: string,
): boolean {
  let bestDisallow = -1;
  for (const pattern of rules.disallow) {
    const len = matchLength(pattern, pathname);
    if (len > bestDisallow) bestDisallow = len;
  }

  if (bestDisallow < 0) return true;

  let bestAllow = -1;
  for (const pattern of rules.allow) {
    const len = matchLength(pattern, pathname);
    if (len > bestAllow) bestAllow = len;
  }

  return bestAllow >= bestDisallow;
}

async function loadRules(
  origin: string,
  hostname: string,
  userAgent: string | undefined,
  timeoutMs: number,
): Promise<RobotsCacheEntry> {
  const cached = robotsCache.get(origin);
  if (cached) return cached;

  const request: Parameters<typeof safeFetch>[0] = {
    url: `${origin}/robots.txt`,
    allowedHosts: [hostname],
    allowedContentTypePrefixes: ['text/plain'],
    maxRedirects: 2,
    timeoutMs,
    maxBytes: ROBOTS_MAX_BYTES,
  };
  if (userAgent) request.headers = { 'user-agent': userAgent };

  let entry: RobotsCacheEntry;
  try {
    const res = await safeFetch(request);

    if (res.status !== 200) {
      entry = {
        kind: 'unavailable',
        reason: `robots.txt unavailable: status ${res.status}`,
      };
    } else {
      entry = {
        kind: 'rules',
        rules: parseRobotsTxt(res.body.toString('utf8'), userAgent),
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    entry = {
      kind: 'unavailable',
      reason: `robots.txt unavailable: ${message}`,
    };
  }

  robotsCache.set(origin, entry);
  return entry;
}

/**
 * Fetches (and caches per origin) robots.txt and answers for one URL.
 * Fetch failure, non-200, or a parse problem => `{ allowed: true }` with an explanatory reason.
 */
export async function isUrlAllowedByRobots(input: {
  url: string;
  userAgent?: string;
  timeoutMs?: number;
}): Promise<{ allowed: boolean; reason: string }> {
  let target: URL;
  try {
    target = new URL(input.url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      allowed: true,
      reason: `robots.txt unavailable: invalid url (${message})`,
    };
  }

  const entry = await loadRules(
    target.origin,
    target.hostname,
    input.userAgent,
    input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  if (entry.kind === 'unavailable') {
    return { allowed: true, reason: entry.reason };
  }

  const allowed = isPathAllowedByRules(entry.rules, target.pathname);
  return {
    allowed,
    reason: allowed
      ? `allowed by robots.txt for ${target.origin}`
      : `disallowed by robots.txt for ${target.origin}${target.pathname}`,
  };
}
