import { logger } from './logger';

/** Defaults for search index coverage audits; override via `SYNAC_SEARCH_COVERAGE_AUDIT_*` env vars. */
export const SEARCH_INDEX_COVERAGE_AUDIT_DEFAULTS = {
  firstPage: 1,
  minQueryLength: 8,
  slowThresholdMs: 250,
} as const;

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function readCoverageAuditFirstPage(): number {
  const raw = process.env.SYNAC_SEARCH_COVERAGE_AUDIT_FIRST_PAGE?.trim();
  if (!raw) return SEARCH_INDEX_COVERAGE_AUDIT_DEFAULTS.firstPage;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return SEARCH_INDEX_COVERAGE_AUDIT_DEFAULTS.firstPage;
  return n;
}

const SEARCH_COVERAGE_AUDIT_THRESHOLDS = {
  firstPage: readCoverageAuditFirstPage(),
  minQueryLength: readPositiveIntEnv(
    'SYNAC_SEARCH_COVERAGE_AUDIT_MIN_QUERY_LENGTH',
    SEARCH_INDEX_COVERAGE_AUDIT_DEFAULTS.minQueryLength,
  ),
  slowThresholdMs: readPositiveIntEnv(
    'SYNAC_SEARCH_COVERAGE_AUDIT_SLOW_MS',
    SEARCH_INDEX_COVERAGE_AUDIT_DEFAULTS.slowThresholdMs,
  ),
} as const;

export function shouldAuditSearchIndexCoverage(input: {
  page: number;
  query: string;
  resultsCount: number;
  durationMs: number;
}): boolean {
  const { firstPage, minQueryLength, slowThresholdMs } = SEARCH_COVERAGE_AUDIT_THRESHOLDS;

  const normalizedQuery = input.query.trim();
  if (input.page !== firstPage) return false;
  if (normalizedQuery.length < minQueryLength) return false;
  return input.resultsCount === 0 || input.durationMs >= slowThresholdMs;
}

export function logSearchIndexCoverage(input: {
  location: string;
  publishedEntries: number;
  indexedEntries: number;
  missingEntryIds: string[];
  orphanedEntryIds: string[];
}): void {
  logger.info('search.index.coverage', {
    location: input.location,
    publishedEntries: input.publishedEntries,
    indexedEntries: input.indexedEntries,
    missingCount: input.missingEntryIds.length,
    orphanedCount: input.orphanedEntryIds.length,
    sampleMissingEntryIds: input.missingEntryIds.slice(0, 10),
    sampleOrphanedEntryIds: input.orphanedEntryIds.slice(0, 10),
  });
}
