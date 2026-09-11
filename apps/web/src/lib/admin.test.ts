import '../test.setup';

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextResponse } from 'next/server';

import {
  createIntegrationTestClient,
  resetIntegrationDatabase,
} from '@synac/db/testing';

import {
  authorized,
  forbidden,
  getAdminActor,
  hasRole,
  requireAdminActor,
  requireRole,
  type AdminSession,
  type ResolveSession,
} from './admin';

const prisma = createIntegrationTestClient();

/** `notFound()` throws this sentinel message in Next. */
const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404';

const ENV_KEYS = [
  'SYNAC_ADMIN_EMAILS',
  'SYNAC_EDITOR_EMAILS',
  'SYNAC_VIEWER_EMAILS',
] as const;

const originalEnv = new Map(
  ENV_KEYS.map((key) => [key, process.env[key]] as const),
);

function sessionFor(email: string): ResolveSession {
  return async () => ({
    userId: `clerk_${email}`,
    email,
    displayName: 'Test User',
  });
}

const noSession: ResolveSession = async () => null;

function request(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:3000/api/v1/admin/tags', { headers });
}

describe('admin actor resolution', () => {
  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);

    process.env.SYNAC_ADMIN_EMAILS = 'boss@example.com';
    process.env.SYNAC_EDITOR_EMAILS = 'editor@example.com';
    process.env.SYNAC_VIEWER_EMAILS = 'viewer@example.com';
  });

  afterEach(() => {
    for (const [key, value] of originalEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('returns null when there is no session', async () => {
    expect(await getAdminActor(noSession)).toBeNull();
  });

  it('returns null for a signed-in user who is on no allowlist', async () => {
    expect(await getAdminActor(sessionFor('stranger@example.com'))).toBeNull();
  });

  it('resolves an allowlisted admin and bootstraps the ADMIN role', async () => {
    const actor = await getAdminActor(sessionFor('boss@example.com'));
    expect(actor?.email).toBe('boss@example.com');
    expect(actor?.roleNames).toContain('ADMIN');
  });

  it('resolves an allowlisted viewer with no write role', async () => {
    const actor = await getAdminActor(sessionFor('viewer@example.com'));
    expect(actor).not.toBeNull();
    expect(actor?.roleNames).not.toContain('ADMIN');
  });

  it('treats a DISABLED user as unauthorized even while allowlisted', async () => {
    const resolve = sessionFor('boss@example.com');
    expect(await getAdminActor(resolve)).not.toBeNull();

    // Revoking access must work by disabling the account, without also having
    // to edit the allowlist env var.
    await prisma.user.update({
      where: { email: 'boss@example.com' },
      data: { status: 'DISABLED' },
    });

    expect(await getAdminActor(resolve)).toBeNull();
  });

  it('404s a caller who is not an actor at all', async () => {
    await expect(requireAdminActor(noSession)).rejects.toThrow(NOT_FOUND);
  });

  it('404s an unauthenticated caller reaching a route gate', async () => {
    // With no identity provider configured the default resolver yields no
    // session, so the route gate must 404 rather than 403.
    delete process.env.CLERK_SECRET_KEY;
    await expect(requireRole(request(), 'ADMIN')).rejects.toThrow(NOT_FOUND);
  });

  it('passes the session display name through to the bootstrapped user', async () => {
    const session: AdminSession = {
      userId: 'clerk_named',
      email: 'boss@example.com',
      displayName: 'Named Boss',
    };
    await getAdminActor(async () => session);

    const user = await prisma.user.findUnique({
      where: { email: 'boss@example.com' },
      select: { displayName: true },
    });
    expect(user?.displayName).toBe('Named Boss');
  });
});

describe('role checks', () => {
  const actor = {
    userId: 'clerk_1',
    email: 'a@example.com',
    dbUserId: 'db_1',
    roleNames: ['EDITOR' as const],
  };

  it('matches any of the listed roles', () => {
    expect(hasRole(actor, 'ADMIN', 'EDITOR')).toBe(true);
    expect(hasRole(actor, 'ADMIN')).toBe(false);
    expect(hasRole(actor)).toBe(false);
  });

  it('accepts any actor when no role is required', () => {
    expect(authorized(actor, [])).toBe(true);
    expect(authorized(actor, ['ADMIN'])).toBe(false);
    expect(authorized(actor, ['ADMIN', 'EDITOR'])).toBe(true);
  });
});

describe('forbidden', () => {
  it('carries the request id in the 403 body', async () => {
    const response = forbidden('req-42');
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'forbidden',
      requestId: 'req-42',
    });
  });
});
