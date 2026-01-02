import { PgBoss } from 'pg-boss';

import { getPrismaClient } from '@synac/db';

import { runIngestRun } from './ingest/run.js';
import { logger } from './logger.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const boss = new PgBoss(databaseUrl);
await boss.start();

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

  const existing = await boss.getSchedules('ingest:cron');

  const desiredKeys = new Set(desired.keys());
  for (const sch of existing) {
    if (!sch.key) continue;
    if (!desiredKeys.has(sch.key)) {
      try {
        await boss.unschedule('ingest:cron', sch.key);
      } catch (err) {
        logger.warn('worker.schedule.unschedule_failed', {
          job: 'ingest:cron',
          key: sch.key,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  for (const [sourceId, cron] of desired) {
    try {
      await boss.schedule('ingest:cron', cron, { sourceId, maxItems: 200 }, { key: sourceId, tz: 'UTC' });
    } catch (err) {
      logger.warn('worker.schedule.schedule_failed', {
        job: 'ingest:cron',
        sourceId,
        cron,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

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

await boss.work<{ sourceId: string; maxItems?: number }>('ingest:cron', async (jobs) => {
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
      logger.warn('worker.ingest_cron.source_not_found', { sourceId });
      continue;
    }
    if (!source.enabled) continue;
    if (!source.allowedUse.trim()) continue;
    if (!source.attributionRequirements.trim()) continue;
    if (!source.lastVerifiedAt) continue;

    const existingRun = await prisma.ingestRun.findFirst({
      where: { sourceId: source.id, status: 'RUNNING' },
      select: { id: true },
    });
    if (existingRun) continue;

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

    await boss.send('ingest:run', { ingestRunId: run.id });
  }
});

await boss.work<{ ingestRunId: string }>('ingest:run', async (jobs) => {
  for (const job of jobs) {
    const ingestRunId = job.data?.ingestRunId;
    if (!ingestRunId) throw new Error('ingestRunId is required');
    await runIngestRun(ingestRunId);
  }
});

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
