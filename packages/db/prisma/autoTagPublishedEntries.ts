import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

import { createPrismaClient } from '../src/client.js';
import {
  AUTO_TAG_DEFINITIONS,
  ensureMissingAutoTagDefinitions,
  syncAutoTagsForPublishedEntry,
} from '../src/queries/autoTagging.js';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '..', '..', '.env') });

/**
 * Backfills AUTO tag links for every indexed published entry.
 *
 * The tag catalog and the matching rules live in
 * `src/queries/autoTagging.ts`; this script only drives them. Existing tag
 * rows are never renamed or re-described: curators own tag metadata, and
 * `ensureMissingAutoTagDefinitions` creates only genuinely absent slugs.
 */
async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const prisma = createPrismaClient(databaseUrl);

  try {
    const ensured = await ensureMissingAutoTagDefinitions(prisma, {
      slugs: AUTO_TAG_DEFINITIONS.map((definition) => definition.slug),
    });

    const batchSize = 500;
    let cursor: { entryId: string } | undefined;

    let scanned = 0;
    let added = 0;
    let removed = 0;

    for (;;) {
      const batch = await prisma.entrySearch.findMany({
        select: { entryId: true },
        orderBy: [{ entryId: 'asc' }],
        take: batchSize,
        skip: cursor ? 1 : 0,
        cursor,
      });

      const last = batch[batch.length - 1];
      if (!last) break;
      cursor = { entryId: last.entryId };

      for (const row of batch) {
        scanned += 1;
        const result = await syncAutoTagsForPublishedEntry(prisma, {
          entryId: row.entryId,
        });
        added += result.added;
        removed += result.removed;
      }
    }

    console.log(
      JSON.stringify(
        { ok: true, tagsEnsured: ensured.length, scanned, added, removed },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

await main();
