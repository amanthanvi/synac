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

export async function resetIntegrationDatabase(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
    `
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename <> '_prisma_migrations'
      ORDER BY tablename ASC
    `,
  );

  if (rows.length === 0) return;

  const tables = rows.map((row) => `"public"."${row.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE;`);
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
