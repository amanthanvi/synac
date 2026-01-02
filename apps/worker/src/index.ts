import { PgBoss } from 'pg-boss';

import { runIngestRun } from './ingest/run.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const boss = new PgBoss(databaseUrl);
await boss.start();

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
