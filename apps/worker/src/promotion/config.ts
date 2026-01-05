export type WorkerMode = 'ingest' | 'promotion' | 'all';

function normalize(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function getWorkerMode(): WorkerMode {
  const explicit = normalize(process.env.SYNAC_WORKER_MODE);
  if (explicit === 'ingest' || explicit === 'staging') return 'ingest';
  if (explicit === 'promotion' || explicit === 'prod' || explicit === 'production') return 'promotion';
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

export function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export function getStagingSourceAllowlist(): Set<string> {
  return new Set(parseCsv(process.env.SYNAC_STAGING_SOURCE_ALLOWLIST).map((s) => s.toLowerCase()));
}

export function isTier1AutopublishEnabled(): boolean {
  const raw = normalize(process.env.SYNAC_AUTOPUBLISH_TIER1);
  if (!raw) return true;
  return raw === 'true' || raw === '1' || raw === 'yes';
}

