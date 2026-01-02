import { PgBoss } from 'pg-boss';

import { getPrismaClient } from '@synac/db';

import { runIngestRun } from './ingest/run.js';

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
        console.warn('synac worker: unschedule failed', sch.key, err);
      }
    }
  }

  for (const [sourceId, cron] of desired) {
    try {
      await boss.schedule('ingest:cron', cron, { sourceId, maxItems: 200 }, { key: sourceId, tz: 'UTC' });
    } catch (err) {
      console.warn('synac worker: schedule failed', sourceId, cron, err);
    }
  }
}

try {
  await syncCronSchedules();
} catch (err) {
  console.warn('synac worker: initial schedule sync failed', err);
}
setInterval(() => {
  void syncCronSchedules().catch((err) => {
    console.warn('synac worker: schedule sync failed', err);
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
      console.warn('synac worker: ingest:cron source not found', sourceId);
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

console.log('synac worker: ready');

async function shutdown() {
  try {
    await boss.stop();
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
