import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import { ensureSystemActor } from '../src/queries/users.js';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '..', '..', '.env') });

function isAcronymLikeTitle(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v.includes(' ')) return false;
  if (v.length < 2 || v.length > 24) return false;

  const letters = v.replace(/[^A-Za-z]/g, '');
  if (letters.length < 1) return false;

  const uppercase = letters.replace(/[^A-Z]/g, '').length;
  const lowercase = letters.replace(/[^a-z]/g, '').length;
  const digits = v.replace(/[^0-9]/g, '').length;

  if (uppercase >= 2 && lowercase <= 2) return true;
  if (uppercase >= 1 && digits >= 1 && letters.length <= 2 && lowercase === 0) return true;

  return false;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  const actor = await ensureSystemActor(prisma);

  const existingAcronymSlugs = new Set(
    (
      await prisma.entry.findMany({
        where: { entryType: 'ACRONYM', deletedAt: null },
        select: { primarySlug: true },
      })
    ).map((e) => e.primarySlug),
  );

  const existingAcronymHistorySlugs = new Set(
    (
      await prisma.entrySlugHistory.findMany({
        where: { entryType: 'ACRONYM' },
        select: { slug: true },
      })
    ).map((h) => h.slug),
  );

  let scanned = 0;
  let converted = 0;
  let skipped = 0;

  let cursor: { id: string } | undefined;
  const batchSize = 500;

  for (;;) {
    const batch = await prisma.entry.findMany({
      where: { entryType: 'TERM', deletedAt: null },
      select: { id: true, displayTitle: true, primarySlug: true, entryType: true },
      orderBy: [{ id: 'asc' }],
      take: batchSize,
      ...(cursor ? { skip: 1, cursor } : {}),
    });

    if (batch.length === 0) break;
    cursor = { id: batch[batch.length - 1]!.id };

    for (const entry of batch) {
      scanned += 1;

      if (!isAcronymLikeTitle(entry.displayTitle)) continue;

      const slug = entry.primarySlug;
      if (existingAcronymSlugs.has(slug) || existingAcronymHistorySlugs.has(slug)) {
        skipped += 1;
        continue;
      }

      try {
        const before = entry;

        const after = await prisma.$transaction(async (tx) => {
          const updated = await tx.entry.update({
            where: { id: entry.id },
            data: { entryType: 'ACRONYM', updatedByUserId: actor.id },
            select: { id: true, entryType: true, displayTitle: true, primarySlug: true },
          });

          await tx.entrySlugHistory.updateMany({
            where: { entryId: entry.id, entryType: 'TERM' },
            data: { entryType: 'ACRONYM' },
          });

          const history = await tx.entrySlugHistory.findMany({
            where: { entryId: entry.id, entryType: 'ACRONYM' },
            select: { slug: true },
          });

          await tx.auditEvent.create({
            data: {
              actorUserId: actor.id,
              action: 'ENTRY_RECLASSIFY',
              entityType: 'ENTRY',
              entityId: entry.id,
              before: { id: before.id, entryType: before.entryType, displayTitle: before.displayTitle, primarySlug: before.primarySlug },
              after: { id: updated.id, entryType: updated.entryType, displayTitle: updated.displayTitle, primarySlug: updated.primarySlug },
            },
          });

          return { updated, history };
        });

        existingAcronymSlugs.add(after.updated.primarySlug);
        for (const h of after.history) {
          existingAcronymHistorySlugs.add(h.slug);
        }
        converted += 1;
      } catch {
        skipped += 1;
      }
    }
  }

  console.log(
    JSON.stringify(
      { ok: true, scanned, converted, skipped },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

await main();
