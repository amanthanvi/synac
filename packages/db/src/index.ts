import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client.js';

type GlobalForPrisma = typeof globalThis & {
  __synacPrisma?: PrismaClient;
};

export function getPrismaClient(): PrismaClient {
  const globalForPrisma = globalThis as GlobalForPrisma;

  if (process.env.NODE_ENV !== 'production' && globalForPrisma.__synacPrisma) {
    return globalForPrisma.__synacPrisma;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to create PrismaClient');
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.__synacPrisma = prisma;
  }

  return prisma;
}

export { PrismaClient };
