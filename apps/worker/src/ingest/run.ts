import { getPrismaClient } from '@synac/db';

import { ingestNistGlossary } from './nistGlossary.js';
import { ingestMitreAttackCti } from './mitreAttackCti.js';
import { ingestOwaspVulnerabilities } from './owaspVulnerabilities.js';
import { logger } from '../logger.js';

function parseMaxItems(configSnapshot: unknown): number {
  if (!configSnapshot || typeof configSnapshot !== 'object') return 100;
  const v = (configSnapshot as Record<string, unknown>).maxItems;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 100;
  return Math.max(1, Math.min(1000, Math.floor(n)));
}

function parseForceReprocess(configSnapshot: unknown): boolean {
  if (!configSnapshot || typeof configSnapshot !== 'object') return false;
  const v = (configSnapshot as Record<string, unknown>).forceReprocess;
  if (typeof v === 'boolean') return v;
  const s = typeof v === 'string' ? v : String(v ?? '');
  return s.trim().toLowerCase() === 'true' || s.trim() === '1';
}

export async function runIngestRun(ingestRunId: string): Promise<void> {
  const prisma = getPrismaClient();
  const startMs = Date.now();

  const run = await prisma.ingestRun.findFirst({
    where: { id: ingestRunId },
    select: {
      id: true,
      status: true,
      startedAt: true,
      configSnapshot: true,
      source: { select: { id: true, baseUrl: true, licenseType: true, lastVerifiedAt: true } },
    },
  });

  if (!run) {
    throw new Error(`Ingest run not found: ${ingestRunId}`);
  }

  if (run.status !== 'RUNNING') {
    return;
  }

  const maxItems = parseMaxItems(run.configSnapshot);
  const forceReprocess = parseForceReprocess(run.configSnapshot);

  try {
    logger.info('ingest.run.start', {
      ingestRunId: run.id,
      sourceId: run.source.id,
      baseUrl: run.source.baseUrl,
      maxItems,
      forceReprocess,
    });

    const baseUrl = run.source.baseUrl.toLowerCase();
    const host = new URL(run.source.baseUrl).hostname.toLowerCase();

    let itemsCreated = 0;
    if (baseUrl.includes('csrc.nist.gov')) {
      const res = await ingestNistGlossary(prisma, {
        ingestRunId: run.id,
        source: {
          id: run.source.id,
          baseUrl: run.source.baseUrl,
          licenseType: run.source.licenseType,
          lastVerifiedAt: run.source.lastVerifiedAt,
        },
        maxItems,
        forceReprocess,
      });
      itemsCreated = res.itemsCreated;
    } else if (host.endsWith('owasp.org')) {
      const res = await ingestOwaspVulnerabilities(prisma, {
        ingestRunId: run.id,
        source: {
          id: run.source.id,
          baseUrl: run.source.baseUrl,
          licenseType: run.source.licenseType,
          lastVerifiedAt: run.source.lastVerifiedAt,
        },
        maxItems,
        forceReprocess,
      });
      itemsCreated = res.itemsCreated;
    } else if (host === 'raw.githubusercontent.com') {
      const res = await ingestMitreAttackCti(prisma, {
        ingestRunId: run.id,
        source: {
          id: run.source.id,
          baseUrl: run.source.baseUrl,
          licenseType: run.source.licenseType,
          lastVerifiedAt: run.source.lastVerifiedAt,
        },
        maxItems,
        forceReprocess,
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

    logger.info('ingest.run.success', {
      ingestRunId: run.id,
      sourceId: run.source.id,
      itemsCreated,
      durationMs: Date.now() - startMs,
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

    logger.error('ingest.run.failed', {
      ingestRunId: run.id,
      sourceId: run.source.id,
      durationMs: Date.now() - startMs,
      error: message,
    });
    throw err;
  }
}
