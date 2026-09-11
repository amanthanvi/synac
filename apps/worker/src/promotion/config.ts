import { parseCsv } from '@synac/db';

export type WorkerMode = 'ingest' | 'promotion' | 'all';

function normalize(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function getWorkerMode(): WorkerMode {
  const explicit = normalize(process.env.SYNAC_WORKER_MODE);
  if (explicit === 'ingest' || explicit === 'staging') return 'ingest';
  if (
    explicit === 'promotion' ||
    explicit === 'prod' ||
    explicit === 'production'
  )
    return 'promotion';
  if (explicit === 'all') return 'all';

  return process.env.SYNAC_STAGING_DATABASE_URL ? 'promotion' : 'ingest';
}

export function isIngestEnabled(mode: WorkerMode): boolean {
  return mode === 'ingest' || mode === 'all';
}

export function isPromotionEnabled(mode: WorkerMode): boolean {
  return mode === 'promotion' || mode === 'all';
}

export function getStagingDatabaseUrl(): string | null {
  const url = process.env.SYNAC_STAGING_DATABASE_URL?.trim();
  return url ? url : null;
}

export function getStagingSourceAllowlist(): Set<string> {
  return new Set(
    parseCsv(process.env.SYNAC_STAGING_SOURCE_ALLOWLIST).map((s) =>
      s.toLowerCase(),
    ),
  );
}

function parseBooleanEnv(
  value: string | undefined,
  fallback: boolean,
): boolean {
  const raw = normalize(value);
  if (!raw) return fallback;
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  return fallback;
}

/**
 * Tier-1 auto-publish writes to the public corpus without a human in the loop,
 * so it fails closed: unset means OFF. Set `SYNAC_AUTOPUBLISH_TIER1=true` to
 * enable it.
 */
export function isTier1AutopublishEnabled(): boolean {
  return parseBooleanEnv(process.env.SYNAC_AUTOPUBLISH_TIER1, false);
}

/**
 * Whether an ingest item whose `licenseGate` is WARN may be auto-published.
 * Defaults to OFF: a WARN means the licence or content-mode needs a human look,
 * so those items are applied but left at `REVIEWED` instead of going public.
 * Set `SYNAC_AUTOPUBLISH_WARN=true` to override.
 */
export function isWarnAutopublishEnabled(): boolean {
  return parseBooleanEnv(process.env.SYNAC_AUTOPUBLISH_WARN, false);
}
