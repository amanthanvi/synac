import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

import {
  createPrismaClient,
  getSearchIndexCoverage,
  getSenseSearchCoverage,
} from '../src/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '..', '..', '.env') });

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const prisma = createPrismaClient(databaseUrl);

  try {
    const [entries, senses] = await Promise.all([
      getSearchIndexCoverage(prisma, { limit: 50 }),
      getSenseSearchCoverage(prisma, { limit: 50 }),
    ]);
    console.log(JSON.stringify({ ok: true, entries, senses }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

await main();
