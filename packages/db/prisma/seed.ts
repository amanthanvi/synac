import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '..', '..', '.env') });

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to seed the database');
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  const adminRole = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: { name: 'ADMIN' },
  });

  const editorRole = await prisma.role.upsert({
    where: { name: 'EDITOR' },
    update: {},
    create: { name: 'EDITOR' },
  });

  await prisma.role.upsert({
    where: { name: 'VIEWER' },
    update: {},
    create: { name: 'VIEWER' },
  });

  const adminEmails = new Set(parseCsv(process.env.SYNAC_ADMIN_EMAILS));
  const editorEmails = parseCsv(process.env.SYNAC_EDITOR_EMAILS).filter(
    (email) => !adminEmails.has(email),
  );

  for (const email of adminEmails) {
    const user = await prisma.user.upsert({
      where: { email },
      update: { status: 'ACTIVE' },
      create: { email, authProvider: 'OIDC', status: 'ACTIVE' },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
      update: {},
      create: { userId: user.id, roleId: adminRole.id },
    });
  }

  for (const email of editorEmails) {
    const user = await prisma.user.upsert({
      where: { email },
      update: { status: 'ACTIVE' },
      create: { email, authProvider: 'OIDC', status: 'ACTIVE' },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: editorRole.id } },
      update: {},
      create: { userId: user.id, roleId: editorRole.id },
    });
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
