import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createIntegrationTestClient,
  disconnectIntegrationPrisma,
  resetIntegrationDatabase,
} from '../testing.js';
import {
  SYSTEM_ACTOR_EMAIL,
  bootstrapUserFromAllowlist,
  ensureSystemActor,
  getRoleNames,
  isUserActive,
  parseCsv,
  pickAllowlistedRole,
  upsertUserFromOidc,
} from './users.js';

const prisma = createIntegrationTestClient();

const EMAIL = 'curator@example.test';

afterAll(async () => {
  await disconnectIntegrationPrisma();
});

describe('allowlist parsing', () => {
  it('picks the highest allowlisted role, case-insensitively', () => {
    const allowlists = {
      adminEmails: ['Admin@Example.test'],
      editorEmails: ['editor@example.test'],
      viewerEmails: parseCsv('Viewer@example.test, spare@example.test'),
    };

    expect(pickAllowlistedRole('admin@example.test', allowlists)).toBe('ADMIN');
    expect(pickAllowlistedRole('EDITOR@example.test', allowlists)).toBe(
      'EDITOR',
    );
    expect(pickAllowlistedRole('viewer@example.test', allowlists)).toBe(
      'VIEWER',
    );
    expect(pickAllowlistedRole('stranger@example.test', allowlists)).toBeNull();
  });

  it('treats a missing viewer allowlist as empty', () => {
    expect(
      pickAllowlistedRole('viewer@example.test', {
        adminEmails: [],
        editorEmails: [],
      }),
    ).toBeNull();
  });
});

describe('bootstrapUserFromAllowlist', () => {
  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
  });

  it('grants exactly the allowlisted role and revokes the rest on the next call', async () => {
    const asAdmin = await bootstrapUserFromAllowlist(prisma, {
      email: EMAIL,
      allowlists: { adminEmails: [EMAIL], editorEmails: [] },
    });

    expect(asAdmin).not.toBeNull();
    expect(asAdmin && getRoleNames(asAdmin.user)).toEqual(['ADMIN']);

    const asEditor = await bootstrapUserFromAllowlist(prisma, {
      email: EMAIL,
      allowlists: { adminEmails: [], editorEmails: [EMAIL] },
    });

    expect(asEditor?.allowlistedRole).toBe('EDITOR');
    expect(asEditor && getRoleNames(asEditor.user)).toEqual(['EDITOR']);

    const revoked = await bootstrapUserFromAllowlist(prisma, {
      email: EMAIL,
      allowlists: { adminEmails: [], editorEmails: [] },
    });

    expect(revoked?.allowlistedRole).toBeNull();
    expect(revoked && getRoleNames(revoked.user)).toEqual([]);
  });

  it('grants VIEWER through the viewer allowlist', async () => {
    const result = await bootstrapUserFromAllowlist(prisma, {
      email: EMAIL,
      allowlists: { adminEmails: [], editorEmails: [], viewerEmails: [EMAIL] },
    });

    expect(result?.allowlistedRole).toBe('VIEWER');
    expect(result && getRoleNames(result.user)).toEqual(['VIEWER']);
  });

  it('returns null for a disabled account and leaves it untouched', async () => {
    const created = await bootstrapUserFromAllowlist(prisma, {
      email: EMAIL,
      allowlists: { adminEmails: [EMAIL], editorEmails: [] },
    });
    expect(created).not.toBeNull();

    await prisma.user.update({
      where: { email: EMAIL },
      data: { status: 'DISABLED' },
    });
    const before = await prisma.user.findUniqueOrThrow({
      where: { email: EMAIL },
    });

    const result = await bootstrapUserFromAllowlist(prisma, {
      email: EMAIL,
      allowlists: { adminEmails: [EMAIL], editorEmails: [] },
    });

    expect(result).toBeNull();

    const after = await prisma.user.findUniqueOrThrow({
      where: { email: EMAIL },
    });
    expect(after.status).toBe('DISABLED');
    expect(after.lastLoginAt?.toISOString()).toBe(
      before.lastLoginAt?.toISOString(),
    );
    expect(isUserActive(after)).toBe(false);
  });

  it('does not reactivate a disabled account through a plain OIDC login', async () => {
    await upsertUserFromOidc(prisma, { email: EMAIL, displayName: 'Curator' });
    await prisma.user.update({
      where: { email: EMAIL },
      data: { status: 'DISABLED' },
    });

    const reloggedIn = await upsertUserFromOidc(prisma, {
      email: EMAIL,
      displayName: 'Curator',
    });

    expect(reloggedIn.status).toBe('DISABLED');
    expect(isUserActive(reloggedIn)).toBe(false);
  });
});

describe('ensureSystemActor', () => {
  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
  });

  it('creates one local admin actor and is idempotent', async () => {
    const first = await ensureSystemActor(prisma);
    const second = await ensureSystemActor(prisma);

    expect(first.id).toBe(second.id);
    expect(first.email).toBe(SYSTEM_ACTOR_EMAIL);
    expect(first.authProvider).toBe('LOCAL');
    expect(getRoleNames(second)).toEqual(['ADMIN']);
    expect(await prisma.user.count()).toBe(1);
  });
});
