import { PgBoss } from 'pg-boss';

import { getPrismaClient, getPrismaClientForUrl } from '@synac/db';

import { runIngestRun } from './ingest/run.js';
import { logger } from './logger.js';
import { getStagingDatabaseUrl, getStagingSourceAllowlist, getWorkerMode, isPromotionEnabled, isTier1AutopublishEnabled, isIngestEnabled } from './promotion/config.js';
import { autoApplyTier1IngestItems } from './promotion/autoApplyTier1.js';
import { importEligibleStagingRuns } from './promotion/importRuns.js';
import { syncSourcesToStaging } from './promotion/sourceSync.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const INGEST_CRON_QUEUE = 'ingest_cron';
const INGEST_RUN_QUEUE = 'ingest_run';
const PROMOTION_SYNC_SOURCES_QUEUE = 'promotion_sync_sources';
const PROMOTION_IMPORT_QUEUE = 'promotion_import_runs';
const PROMOTION_AUTO_APPLY_QUEUE = 'promotion_auto_apply_tier1';

const boss = new PgBoss(databaseUrl);
await boss.start();

await boss.createQueue(INGEST_CRON_QUEUE);
await boss.createQueue(INGEST_RUN_QUEUE);
await boss.createQueue(PROMOTION_SYNC_SOURCES_QUEUE);
await boss.createQueue(PROMOTION_IMPORT_QUEUE);
await boss.createQueue(PROMOTION_AUTO_APPLY_QUEUE);

const workerMode = getWorkerMode();
logger.info('worker.mode', { mode: workerMode });

function logIngestCronSkip(input: {
  sourceId: string;
  reason:
    | 'source_not_found'
    | 'source_disabled'
    | 'missing_allowed_use'
    | 'missing_attribution_requirements'
    | 'missing_last_verified_at'
    | 'ingest_run_already_running';
}): void {
  logger.info('worker.ingest_cron.skip', input);
}

async function syncCronSchedules(): Promise<void> {
  const prisma = getPrismaClient();

  const sources = await prisma.source.findMany({
    where: { enabled: true },
    select: { id: true, cronSchedule: true },
  });

  const desired = new Map<string, string>();
  for (const s of sources) {
    const cron = s.cronSchedule?.trim();
    if (cron) desired.set(s.id, cron);
  }

  const existing = await boss.getSchedules(INGEST_CRON_QUEUE);

  const desiredKeys = new Set(desired.keys());
  for (const sch of existing) {
    if (!sch.key) continue;
    if (!desiredKeys.has(sch.key)) {
      try {
        await boss.unschedule(INGEST_CRON_QUEUE, sch.key);
      } catch (err) {
        logger.warn('worker.schedule.unschedule_failed', {
          job: INGEST_CRON_QUEUE,
          key: sch.key,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  for (const [sourceId, cron] of desired) {
    try {
      await boss.schedule(INGEST_CRON_QUEUE, cron, { sourceId, maxItems: 200 }, { key: sourceId, tz: 'UTC' });
    } catch (err) {
      logger.warn('worker.schedule.schedule_failed', {
        job: INGEST_CRON_QUEUE,
        sourceId,
        cron,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info('worker.schedule.sync_complete', {
    enabledSourceCount: sources.length,
    scheduledSourceCount: desired.size,
    existingScheduleCount: existing.length,
  });
}

if (isIngestEnabled(workerMode)) {
  try {
    await syncCronSchedules();
  } catch (err) {
    logger.warn('worker.schedule.initial_sync_failed', { error: err instanceof Error ? err.message : String(err) });
  }
  setInterval(() => {
    void syncCronSchedules().catch((err) => {
      logger.warn('worker.schedule.sync_failed', { error: err instanceof Error ? err.message : String(err) });
    });
  }, 10 * 60 * 1000);
}

if (isIngestEnabled(workerMode)) {
  await boss.work<{ sourceId: string; maxItems?: number }>(INGEST_CRON_QUEUE, async (jobs) => {
    const prisma = getPrismaClient();

    for (const job of jobs) {
      const sourceId = job.data?.sourceId;
      if (!sourceId) throw new Error('sourceId is required');

      const maxItems = typeof job.data?.maxItems === 'number' ? job.data.maxItems : Number(job.data?.maxItems);
      const normalizedMaxItems = Number.isFinite(maxItems) ? Math.max(1, Math.min(1000, Math.floor(maxItems))) : 200;

      const source = await prisma.source.findFirst({
        where: { id: sourceId },
        select: { id: true, enabled: true, allowedUse: true, attributionRequirements: true, lastVerifiedAt: true },
      });

      if (!source) {
        logIngestCronSkip({ sourceId, reason: 'source_not_found' });
        continue;
      }
      if (!source.enabled) {
        logIngestCronSkip({ sourceId, reason: 'source_disabled' });
        continue;
      }
      if (!source.allowedUse.trim()) {
        logIngestCronSkip({ sourceId, reason: 'missing_allowed_use' });
        continue;
      }
      if (!source.attributionRequirements.trim()) {
        logIngestCronSkip({ sourceId, reason: 'missing_attribution_requirements' });
        continue;
      }
      if (!source.lastVerifiedAt) {
        logIngestCronSkip({ sourceId, reason: 'missing_last_verified_at' });
        continue;
      }

      const existingRun = await prisma.ingestRun.findFirst({
        where: { sourceId: source.id, status: 'RUNNING' },
        select: { id: true },
      });
      if (existingRun) {
        logIngestCronSkip({ sourceId, reason: 'ingest_run_already_running' });
        continue;
      }

      const run = await prisma.ingestRun.create({
        data: {
          sourceId: source.id,
          startedAt: new Date(),
          status: 'RUNNING',
          triggeredBy: 'CRON',
          triggeredByUserId: null,
          configSnapshot: { maxItems: normalizedMaxItems },
        },
        select: { id: true },
      });

      await boss.send(INGEST_RUN_QUEUE, { ingestRunId: run.id });
    }
  });

  await boss.work<{ ingestRunId: string }>(INGEST_RUN_QUEUE, async (jobs) => {
    for (const job of jobs) {
      const ingestRunId = job.data?.ingestRunId;
      if (!ingestRunId) throw new Error('ingestRunId is required');
      await runIngestRun(ingestRunId);
    }
  });
}

if (isPromotionEnabled(workerMode)) {
  const stagingDatabaseUrl = getStagingDatabaseUrl();
  if (!stagingDatabaseUrl) throw new Error('SYNAC_STAGING_DATABASE_URL is required for promotion worker mode');

  const stagingAllowlist = getStagingSourceAllowlist();
  const staging = getPrismaClientForUrl(stagingDatabaseUrl);
  const prod = getPrismaClient();

  try {
    await boss.schedule(PROMOTION_SYNC_SOURCES_QUEUE, '*/5 * * * *', {}, { key: 'sync_sources', tz: 'UTC' });
    await boss.schedule(PROMOTION_IMPORT_QUEUE, '*/2 * * * *', {}, { key: 'import_runs', tz: 'UTC' });
    await boss.schedule(PROMOTION_AUTO_APPLY_QUEUE, '*/1 * * * *', {}, { key: 'auto_apply', tz: 'UTC' });
  } catch (err) {
    logger.warn('promotion.schedule_failed', { error: err instanceof Error ? err.message : String(err) });
  }

  await boss.work(PROMOTION_SYNC_SOURCES_QUEUE, async (jobs) => {
    if (!jobs.length) return;
    const res = await syncSourcesToStaging(prod, staging, { enabledAllowlistSlugs: stagingAllowlist });
    logger.info('promotion.sync_sources.ok', { ...res, jobCount: jobs.length });
  });

  await boss.work(PROMOTION_IMPORT_QUEUE, async (jobs) => {
    if (!jobs.length) return;
    const res = await importEligibleStagingRuns(prod, staging, { maxRuns: 20, maxItemsPerRun: 1000 });
    logger.info('promotion.import_runs.ok', { ...res, jobCount: jobs.length });
  });

  await boss.work(PROMOTION_AUTO_APPLY_QUEUE, async (jobs) => {
    if (!isTier1AutopublishEnabled()) return;
    if (!jobs.length) return;
    const res = await autoApplyTier1IngestItems(prod, { maxItems: 25 });
    logger.info('autopublish.tier1.ok', { ...res, jobCount: jobs.length });
  });
}

logger.info('worker.ready');

async function shutdown() {
  try {
    await boss.stop();
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
