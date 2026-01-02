import { afterEach, describe, expect, it } from 'vitest';

import { getPrismaClient } from './index.js';

type GlobalForPrisma = typeof globalThis & {
  __synacPrisma?: unknown;
};

afterEach(() => {
  delete process.env.DATABASE_URL;

  const globalForPrisma = globalThis as GlobalForPrisma;
  delete globalForPrisma.__synacPrisma;
});

describe('db', () => {
  it('throws when DATABASE_URL is missing', () => {
    expect(() => getPrismaClient()).toThrow(/DATABASE_URL/i);
  });

  it('caches Prisma client in non-production', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/synac';

    const prismaA = getPrismaClient();
    const prismaB = getPrismaClient();

    expect(prismaA).toBe(prismaB);
    await prismaA.$disconnect();
  });
});
