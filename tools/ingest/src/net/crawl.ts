import {
  safeFetch,
  type FetchImpl,
  type SafeFetchOptions,
  type SafeFetchResult,
} from './safeFetch.js';

const DEFAULT_MIN_DELAY_MS = 250;
const ROBOTS_TIMEOUT_MS = 10_000;
const ROBOTS_MAX_BYTES = 512 * 1024;

export type RobotsRules = {
  rules: Array<{ allow: boolean; path: string }>;
  crawlDelayMs: number | null;
};

const NO_RULES: RobotsRules = { rules: [], crawlDelayMs: null };

/**
 * Parses the `User-agent: *` groups of a robots.txt body. Groups aimed at other
 * agents are ignored, because this crawler only ever identifies as itself and
 * falls back to the wildcard group.
 */
export function parseRobotsTxt(body: string): RobotsRules {
  const rules: RobotsRules['rules'] = [];
  let crawlDelayMs: number | null = null;
  let wildcardGroup = false;
  let inRules = false;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = (rawLine.split('#')[0] ?? '').trim();
    const separator = line.indexOf(':');
    if (separator < 0) continue;

    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === 'user-agent') {
      // Consecutive user-agent lines share one group; a rule line closes it.
      if (inRules) {
        wildcardGroup = false;
        inRules = false;
      }
      if (value === '*') wildcardGroup = true;
      continue;
    }

    if (field !== 'allow' && field !== 'disallow' && field !== 'crawl-delay')
      continue;
    inRules = true;
    if (!wildcardGroup) continue;

    if (field === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds > 0)
        crawlDelayMs = Math.round(seconds * 1000);
      continue;
    }

    // An empty Disallow means "nothing is disallowed", so it adds no rule.
    if (!value) continue;
    rules.push({ allow: field === 'allow', path: value });
  }

  return { rules, crawlDelayMs };
}

function toMatcher(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}${anchored ? '$' : ''}`);
}

/** Longest matching rule wins; an allow rule wins a tie; no match means allowed. */
export function isPathAllowed(robots: RobotsRules, path: string): boolean {
  let best: { allow: boolean; length: number } | null = null;

  for (const rule of robots.rules) {
    if (!toMatcher(rule.path).test(path)) continue;
    const length = rule.path.length;
    if (
      !best ||
      length > best.length ||
      (length === best.length && rule.allow)
    ) {
      best = { allow: rule.allow, length };
    }
  }

  return best ? best.allow : true;
}

export type Crawler = {
  fetch(options: SafeFetchOptions): Promise<SafeFetchResult>;
};

/**
 * Wraps a fetch implementation with per-host robots.txt rules and a per-host
 * minimum delay between request starts. Concurrency is untouched: callers still
 * run in parallel, they just take paced turns at the starting line.
 */
export function createCrawler(input: {
  userAgent: string;
  fetchImpl?: FetchImpl;
  minDelayMs?: number;
}): Crawler {
  const fetchImpl = input.fetchImpl ?? safeFetch;
  const minDelayMs = input.minDelayMs ?? DEFAULT_MIN_DELAY_MS;
  const robotsByHost = new Map<string, Promise<RobotsRules>>();
  const nextStartByHost = new Map<string, number>();

  const loadRobots = async (url: URL): Promise<RobotsRules> => {
    try {
      const response = await fetchImpl({
        url: new URL('/robots.txt', url.origin).toString(),
        allowedHosts: [url.hostname],
        allowedContentTypePrefixes: ['text/plain'],
        maxRedirects: 3,
        timeoutMs: ROBOTS_TIMEOUT_MS,
        maxBytes: ROBOTS_MAX_BYTES,
        headers: { 'user-agent': input.userAgent },
      });
      if (response.status !== 200) return NO_RULES;
      return parseRobotsTxt(response.body.toString('utf8'));
    } catch {
      // No readable robots.txt (missing, redirected to HTML, unreachable).
      return NO_RULES;
    }
  };

  const reserveStart = (hostname: string, delayMs: number): Promise<void> => {
    const now = Date.now();
    const startAt = Math.max(now, nextStartByHost.get(hostname) ?? 0);
    // Reserved synchronously so concurrent callers claim distinct slots.
    nextStartByHost.set(hostname, startAt + delayMs);
    const wait = startAt - now;
    if (wait <= 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, wait));
  };

  return {
    async fetch(options) {
      const url = new URL(options.url);
      let robots = robotsByHost.get(url.hostname);
      if (!robots) {
        robots = loadRobots(url);
        robotsByHost.set(url.hostname, robots);
      }
      const rules = await robots;

      if (!isPathAllowed(rules, `${url.pathname}${url.search}`)) {
        throw new Error(`Blocked by robots.txt: ${options.url}`);
      }

      await reserveStart(
        url.hostname,
        Math.max(minDelayMs, rules.crawlDelayMs ?? 0),
      );
      return fetchImpl(options);
    },
  };
}
