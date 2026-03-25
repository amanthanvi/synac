import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

import { createPrismaClient, getSearchIndexCoverage } from '../src/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '..', '..', '.env') });

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const prisma = createPrismaClient(databaseUrl);

  try {
    const coverage = await getSearchIndexCoverage(prisma, { limit: 50 });
    console.log(JSON.stringify({ ok: true, ...coverage }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

await main();
