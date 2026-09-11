import { Prisma } from '@prisma/client';

import { createPrismaClient, type PrismaClient } from './client.js';

const DEFAULT_TEST_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/synac_test?schema=public';
const DEFAULT_TEST_STAGING_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/synac_staging_test?schema=public';

let integrationPrisma: PrismaClient | null = null;
let integrationStagingPrisma: PrismaClient | null = null;

export function createIntegrationTestClient(): PrismaClient {
  if (integrationPrisma) return integrationPrisma;
  integrationPrisma = createPrismaClient(
    process.env.DATABASE_URL?.trim() || DEFAULT_TEST_DATABASE_URL,
  );
  return integrationPrisma;
}

export function createIntegrationStagingTestClient(): PrismaClient {
  if (integrationStagingPrisma) return integrationStagingPrisma;
  integrationStagingPrisma = createPrismaClient(
    process.env.SYNAC_STAGING_DATABASE_URL?.trim() ||
      DEFAULT_TEST_STAGING_DATABASE_URL,
  );
  return integrationStagingPrisma;
}

async function assertIntegrationDatabaseSafeForTruncate(
  prisma: PrismaClient,
): Promise<void> {
  if (process.env.SYNAC_ALLOW_INTEGRATION_DB_RESET === '1') {
    return;
  }

  if (process.env.VITEST !== 'true' && process.env.NODE_ENV !== 'test') {
    throw new Error(
      'resetIntegrationDatabase refused: run tests under Vitest / NODE_ENV=test, or set SYNAC_ALLOW_INTEGRATION_DB_RESET=1 for an explicit break-glass reset.',
    );
  }

  const [meta] = await prisma.$queryRaw<Array<{ db: string }>>(Prisma.sql`
    SELECT current_database() AS db
  `);

  if (!meta) {
    throw new Error(
      'resetIntegrationDatabase: could not read database connection metadata.',
    );
  }

  // Checked against the live `current_database()` rather than DATABASE_URL, so a
  // staging client cannot be reset through the main client's env var.
  if (!meta.db.endsWith('_test')) {
    throw new Error(
      `resetIntegrationDatabase refused: database "${meta.db}" is not an allowed integration test target (use a name ending in _test, e.g. synac_test, or set SYNAC_ALLOW_INTEGRATION_DB_RESET=1).`,
    );
  }
}

export async function resetIntegrationDatabase(
  prisma: PrismaClient,
): Promise<void> {
  await assertIntegrationDatabaseSafeForTruncate(prisma);

  const rows = await prisma.$queryRaw<Array<{ qname: string }>>(Prisma.sql`
    SELECT quote_ident(schemaname::text) || '.' || quote_ident(tablename::text) AS qname
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
    ORDER BY tablename ASC
  `);

  if (rows.length === 0) return;

  const tableList = rows.map((row) => row.qname).join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE;`,
  );
}

export async function disconnectIntegrationPrisma(): Promise<void> {
  if (integrationPrisma) {
    await integrationPrisma.$disconnect();
    integrationPrisma = null;
  }
  if (integrationStagingPrisma) {
    await integrationStagingPrisma.$disconnect();
    integrationStagingPrisma = null;
  }
}
