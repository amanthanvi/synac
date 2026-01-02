import { getPrismaClient } from '@synac/db';

import { ingestNistGlossary } from './nistGlossary.js';

function parseMaxItems(configSnapshot: unknown): number {
  if (!configSnapshot || typeof configSnapshot !== 'object') return 100;
  const v = (configSnapshot as Record<string, unknown>).maxItems;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 100;
  return Math.max(1, Math.min(1000, Math.floor(n)));
}

export async function runIngestRun(ingestRunId: string): Promise<void> {
  const prisma = getPrismaClient();

  const run = await prisma.ingestRun.findFirst({
    where: { id: ingestRunId },
    select: {
      id: true,
      status: true,
      startedAt: true,
      configSnapshot: true,
      source: { select: { id: true, baseUrl: true, licenseType: true } },
    },
  });

  if (!run) {
    throw new Error(`Ingest run not found: ${ingestRunId}`);
  }

  if (run.status !== 'RUNNING') {
    return;
  }

  const maxItems = parseMaxItems(run.configSnapshot);

  try {
    const baseUrl = run.source.baseUrl.toLowerCase();

    let itemsCreated = 0;
    if (baseUrl.includes('csrc.nist.gov')) {
      const res = await ingestNistGlossary(prisma, {
        ingestRunId: run.id,
        source: { id: run.source.id, baseUrl: run.source.baseUrl, licenseType: run.source.licenseType },
        maxItems,
      });
      itemsCreated = res.itemsCreated;
    } else {
      throw new Error(`No ingest adapter configured for source baseUrl: ${run.source.baseUrl}`);
    }

    await prisma.ingestRun.update({
      where: { id: run.id },
      data: {
        status: 'SUCCESS',
        finishedAt: new Date(),
        stats: { itemsCreated },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.ingestRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        stats: { error: message },
      },
    });
    throw err;
  }
}

