/**
 * One-shot editorial sync: `pnpm --filter @synac/worker editorial:sync`.
 * Same code path as the scheduled `editorial_sync` pg-boss job.
 *
 * Usage: editorial:sync [contentDir]
 */
import { getPrismaClient } from '@synac/db';

import { logger } from '../logger.js';
import { syncContentDirectory } from './contentSync.js';

const contentDir = process.argv[2]?.trim();

const prisma = getPrismaClient();

try {
  const result = await syncContentDirectory(
    prisma,
    contentDir ? { contentDir } : undefined,
  );
  logger.info('editorial.sync.cli.done', { ...result });
  await prisma.$disconnect();
  process.exit(result.filesInvalid > 0 ? 1 : 0);
} catch (err) {
  logger.error('editorial.sync.cli.failed', {
    error: err instanceof Error ? err.message : String(err),
  });
  await prisma.$disconnect();
  process.exit(1);
}
