import { Prisma } from '@prisma/client';

import { createPrismaClient, type PrismaClient } from './client.js';

const DEFAULT_TEST_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/synac?schema=public';
const DEFAULT_TEST_STAGING_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/synac_staging?schema=public';

export function getIntegrationDatabaseUrl(): string {
  return process.env.DATABASE_URL?.trim() || DEFAULT_TEST_DATABASE_URL;
}

export function createIntegrationTestDatabase(): string {
  return getIntegrationDatabaseUrl();
}

export function getIntegrationStagingDatabaseUrl(): string {
  return (
    process.env.SYNAC_STAGING_DATABASE_URL?.trim() || DEFAULT_TEST_STAGING_DATABASE_URL
  );
}

let integrationPrisma: PrismaClient | null = null;
let integrationStagingPrisma: PrismaClient | null = null;

export function getIntegrationPrismaClient(): PrismaClient {
  if (integrationPrisma) return integrationPrisma;
  integrationPrisma = createPrismaClient(getIntegrationDatabaseUrl());
  return integrationPrisma;
}

export function createIntegrationTestClient(): PrismaClient {
  return getIntegrationPrismaClient();
}

export function getIntegrationStagingPrismaClient(): PrismaClient {
  if (integrationStagingPrisma) return integrationStagingPrisma;
  integrationStagingPrisma = createPrismaClient(getIntegrationStagingDatabaseUrl());
  return integrationStagingPrisma;
}

export function createIntegrationStagingTestClient(): PrismaClient {
  return getIntegrationStagingPrismaClient();
}

function integrationDatabaseResetAllowedByEnv(): boolean {
  return process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
}

/**
 * Allowlist by actual `current_database()` — not `DATABASE_URL` — so staging vs main clients are checked correctly.
 * We intentionally do not require `inet_server_addr()` loopback: Docker Postgres (and similar) often reports a bridge
 * IP (e.g. 172.17.x.x) even when the client connected via localhost port mapping.
 */
function integrationDatabaseNameAllowedForReset(dbName: string): boolean {
  if (dbName.endsWith('_test')) return true;
  if (dbName === 'synac' || dbName === 'synac_staging') return true;
  return false;
}

async function assertIntegrationDatabaseSafeForTruncate(prisma: PrismaClient): Promise<void> {
  if (process.env.SYNAC_ALLOW_INTEGRATION_DB_RESET === '1') {
    return;
  }

  if (!integrationDatabaseResetAllowedByEnv()) {
    throw new Error(
      'resetIntegrationDatabase refused: run tests under Vitest / NODE_ENV=test, or set SYNAC_ALLOW_INTEGRATION_DB_RESET=1 for an explicit break-glass reset.',
    );
  }

  const [meta] = await prisma.$queryRaw<Array<{ db: string }>>(Prisma.sql`
    SELECT current_database() AS db
  `);

  if (!meta) {
    throw new Error('resetIntegrationDatabase: could not read database connection metadata.');
  }

  if (!integrationDatabaseNameAllowedForReset(meta.db)) {
    throw new Error(
      `resetIntegrationDatabase refused: database "${meta.db}" is not an allowed integration test target (use synac/synac_staging, a *_test database name, or SYNAC_ALLOW_INTEGRATION_DB_RESET=1).`,
    );
  }
}

export async function resetIntegrationDatabase(prisma: PrismaClient): Promise<void> {
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
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE;`);
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
