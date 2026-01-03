import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';

type GlobalForPrisma = typeof globalThis & {
  __synacPrisma?: PrismaClient;
  __synacPrismaByUrl?: Map<string, PrismaClient>;
};

export type DbTransactionClient = Prisma.TransactionClient;
export type DbClientLike = PrismaClient | Prisma.TransactionClient;

export function createPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}

export function getPrismaClientForUrl(databaseUrl: string): PrismaClient {
  const globalForPrisma = globalThis as GlobalForPrisma;

  if (!globalForPrisma.__synacPrismaByUrl) {
    globalForPrisma.__synacPrismaByUrl = new Map<string, PrismaClient>();
  }

  const existing = globalForPrisma.__synacPrismaByUrl.get(databaseUrl);
  if (existing) return existing;

  const prisma = createPrismaClient(databaseUrl);
  globalForPrisma.__synacPrismaByUrl.set(databaseUrl, prisma);
  return prisma;
}

export function getPrismaClient(): PrismaClient {
  const globalForPrisma = globalThis as GlobalForPrisma;

  if (process.env.NODE_ENV !== 'production' && globalForPrisma.__synacPrisma) {
    return globalForPrisma.__synacPrisma;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to create PrismaClient');
  }

  const prisma = createPrismaClient(databaseUrl);

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.__synacPrisma = prisma;
  }

  return prisma;
}

export async function withTransaction<T>(
  fn: (tx: DbTransactionClient) => Promise<T>,
): Promise<T> {
  const prisma = getPrismaClient();
  return prisma.$transaction(fn);
}

export { PrismaClient };
