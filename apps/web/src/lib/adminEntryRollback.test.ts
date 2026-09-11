import '../test.setup';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type { Prisma } from '@synac/db';
import {
  createIntegrationTestClient,
  resetIntegrationDatabase,
} from '@synac/db/testing';

import { rollbackEntryToAuditEvent } from './adminEntryRollback';

const prisma = createIntegrationTestClient();

async function createActor(): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email: 'admin@example.com',
      authProvider: 'LOCAL',
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  return user.id;
}

async function createEntry(): Promise<string> {
  const entry = await prisma.entry.create({
    data: {
      entryType: 'TERM',
      displayTitle: 'Phishing',
      normalizedTitle: 'phishing',
      primarySlug: 'phishing',
      status: 'PUBLISHED',
      summaryMd: 'Current summary.',
      summaryText: 'Current summary.',
      publishedAt: new Date('2026-03-24T00:00:00.000Z'),
    },
    select: { id: true },
  });
  return entry.id;
}

async function createSnapshot(
  actorUserId: string,
  entryId: string,
  before: Prisma.InputJsonObject,
): Promise<string> {
  const event = await prisma.auditEvent.create({
    data: {
      actorUserId,
      action: 'ENTRY_UPDATE',
      entityType: 'ENTRY',
      entityId: entryId,
      before,
    },
    select: { id: true },
  });
  return event.id;
}

describe('rollbackEntryToAuditEvent', () => {
  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('restores a valid snapshot', async () => {
    const actorUserId = await createActor();
    const entryId = await createEntry();
    const auditEventId = await createSnapshot(actorUserId, entryId, {
      displayTitle: 'Phishing (old)',
      normalizedTitle: 'phishing old',
      primarySlug: 'phishing',
      status: 'DRAFT',
      summaryMd: 'Older summary.',
      summaryText: 'Older summary.',
      editorialNotes: null,
      publishedAt: null,
    });

    await rollbackEntryToAuditEvent({ actorUserId, entryId, auditEventId });

    const entry = await prisma.entry.findUniqueOrThrow({
      where: { id: entryId },
    });
    expect(entry.displayTitle).toBe('Phishing (old)');
    expect(entry.status).toBe('DRAFT');
    expect(entry.summaryMd).toBe('Older summary.');
    expect(entry.publishedAt).toBeNull();
  });

  it('rejects a snapshot whose status is not a real EntryStatus', async () => {
    const actorUserId = await createActor();
    const entryId = await createEntry();
    const auditEventId = await createSnapshot(actorUserId, entryId, {
      displayTitle: 'Phishing',
      primarySlug: 'phishing',
      // An enum value that no longer exists (or never did). Writing this
      // straight into the update used to fail deep inside Prisma.
      status: 'SUPERPUBLISHED',
    });

    await expect(
      rollbackEntryToAuditEvent({ actorUserId, entryId, auditEventId }),
    ).rejects.toThrow(/not a valid entry snapshot/i);

    const entry = await prisma.entry.findUniqueOrThrow({
      where: { id: entryId },
    });
    expect(entry.status).toBe('PUBLISHED');
    expect(entry.displayTitle).toBe('Phishing');
  });

  it('rejects a snapshot whose fields have the wrong types', async () => {
    const actorUserId = await createActor();
    const entryId = await createEntry();
    const auditEventId = await createSnapshot(actorUserId, entryId, {
      displayTitle: 42,
      primarySlug: ['phishing'],
    });

    await expect(
      rollbackEntryToAuditEvent({ actorUserId, entryId, auditEventId }),
    ).rejects.toThrow(/not a valid entry snapshot/i);
  });

  it('refuses when the audit event carries no snapshot', async () => {
    const actorUserId = await createActor();
    const entryId = await createEntry();

    const event = await prisma.auditEvent.create({
      data: {
        actorUserId,
        action: 'ENTRY_CREATE',
        entityType: 'ENTRY',
        entityId: entryId,
      },
      select: { id: true },
    });

    await expect(
      rollbackEntryToAuditEvent({
        actorUserId,
        entryId,
        auditEventId: event.id,
      }),
    ).rejects.toThrow(/no rollback snapshot/i);
  });

  it('refuses a snapshot belonging to a different entry', async () => {
    const actorUserId = await createActor();
    const entryId = await createEntry();

    const other = await prisma.entry.create({
      data: {
        entryType: 'TERM',
        displayTitle: 'Other',
        normalizedTitle: 'other',
        primarySlug: 'other',
        status: 'DRAFT',
      },
      select: { id: true },
    });
    const auditEventId = await createSnapshot(actorUserId, other.id, {
      displayTitle: 'Other old',
    });

    await expect(
      rollbackEntryToAuditEvent({ actorUserId, entryId, auditEventId }),
    ).rejects.toThrow(/no rollback snapshot/i);
  });
});
