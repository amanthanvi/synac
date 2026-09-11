import type { DbClientLike } from '../client.js';
import type { Prisma, RoleName, UserStatus } from '@prisma/client';

export type UserWithRoles = Prisma.UserGetPayload<{
  include: { roles: { include: { role: true } } };
}>;

/**
 * Environment allowlists, one CSV env var per role:
 * `SYNAC_ADMIN_EMAILS`, `SYNAC_EDITOR_EMAILS`, `SYNAC_VIEWER_EMAILS`.
 */
export type RoleAllowlists = {
  adminEmails: readonly string[];
  editorEmails: readonly string[];
  viewerEmails?: readonly string[];
};

export function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export function getRoleNames(user: UserWithRoles): RoleName[] {
  return user.roles.map((ur) => ur.role.name);
}

export function isUserActive(user: { status: UserStatus }): boolean {
  return user.status === 'ACTIVE';
}

function includesEmail(
  list: readonly string[] | undefined,
  normalizedEmail: string,
): boolean {
  if (!list) return false;
  return list.some((entry) => entry.trim().toLowerCase() === normalizedEmail);
}

export function pickAllowlistedRole(
  email: string,
  allowlists: RoleAllowlists,
): RoleName | null {
  const normalizedEmail = email.trim().toLowerCase();

  if (includesEmail(allowlists.adminEmails, normalizedEmail)) return 'ADMIN';
  if (includesEmail(allowlists.editorEmails, normalizedEmail)) return 'EDITOR';
  if (includesEmail(allowlists.viewerEmails, normalizedEmail)) return 'VIEWER';

  return null;
}

async function ensureDefaultRoles(
  db: DbClientLike,
): Promise<Record<RoleName, string>> {
  const adminRole = await db.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: { name: 'ADMIN' },
  });

  const editorRole = await db.role.upsert({
    where: { name: 'EDITOR' },
    update: {},
    create: { name: 'EDITOR' },
  });

  const viewerRole = await db.role.upsert({
    where: { name: 'VIEWER' },
    update: {},
    create: { name: 'VIEWER' },
  });

  return {
    ADMIN: adminRole.id,
    EDITOR: editorRole.id,
    VIEWER: viewerRole.id,
  };
}

/**
 * Records a successful OIDC login. `status` is set only at creation: an
 * administrator who disables an account must not have it silently reactivated
 * by the next login.
 */
export async function upsertUserFromOidc(
  db: DbClientLike,
  input: {
    email: string;
    displayName?: string | null;
    providerSubject?: string | null;
    lastLoginAt?: Date;
  },
): Promise<UserWithRoles> {
  const now = input.lastLoginAt ?? new Date();

  return db.user.upsert({
    where: { email: input.email },
    update: {
      displayName: input.displayName ?? undefined,
      providerSubject: input.providerSubject ?? undefined,
      lastLoginAt: now,
    },
    create: {
      email: input.email,
      status: 'ACTIVE',
      authProvider: 'OIDC',
      displayName: input.displayName ?? undefined,
      providerSubject: input.providerSubject ?? undefined,
      lastLoginAt: now,
    },
    include: { roles: { include: { role: true } } },
  });
}

async function ensureUserRole(
  db: DbClientLike,
  input: { userId: string; roleId: string },
): Promise<void> {
  await db.userRole.upsert({
    where: {
      userId_roleId: { userId: input.userId, roleId: input.roleId },
    },
    update: {},
    create: { userId: input.userId, roleId: input.roleId },
  });
}

/**
 * Makes the stored role grants match the allowlist exactly. Roles are not
 * hierarchical here: an allowlisted role grants only itself, and every other
 * role the user holds is revoked.
 */
async function syncUserRolesToAllowlist(
  db: DbClientLike,
  input: { userId: string; allowlistedRole: RoleName | null },
): Promise<void> {
  const roleIds = await ensureDefaultRoles(db);
  const desiredRoleIds = input.allowlistedRole
    ? [roleIds[input.allowlistedRole]]
    : [];

  const where: Prisma.UserRoleWhereInput = { userId: input.userId };
  if (desiredRoleIds.length > 0) where.roleId = { notIn: desiredRoleIds };
  await db.userRole.deleteMany({ where });

  for (const roleId of desiredRoleIds) {
    await ensureUserRole(db, { userId: input.userId, roleId });
  }
}

/**
 * Upserts the signed-in user and re-syncs their roles to the allowlist on every
 * call. Returns `null` when the account row exists but is `DISABLED`, so a
 * revoked operator cannot re-enter through the allowlist.
 */
export async function bootstrapUserFromAllowlist(
  db: DbClientLike,
  input: {
    email: string;
    displayName?: string | null;
    providerSubject?: string | null;
    allowlists: RoleAllowlists;
  },
): Promise<{
  user: UserWithRoles;
  allowlistedRole: RoleName | null;
} | null> {
  const allowlistedRole = pickAllowlistedRole(input.email, input.allowlists);

  const existing = await db.user.findUnique({
    where: { email: input.email },
    select: { id: true, status: true },
  });

  if (existing && !isUserActive(existing)) return null;

  const user = await upsertUserFromOidc(db, {
    email: input.email,
    displayName: input.displayName,
    providerSubject: input.providerSubject,
  });

  await syncUserRolesToAllowlist(db, { userId: user.id, allowlistedRole });

  const refreshedUser = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    include: { roles: { include: { role: true } } },
  });

  return { user: refreshedUser, allowlistedRole };
}

/**
 * Fixed identity used by background jobs (promotion, reclassification, seeds)
 * that need an actor for audit rows. It is a local, non-loginable account: no
 * OIDC provider issues this address and no allowlist grants it.
 */
export const SYSTEM_ACTOR_EMAIL = 'system@synac.app';

export async function ensureSystemActor(
  db: DbClientLike,
): Promise<UserWithRoles> {
  const roles = await ensureDefaultRoles(db);

  const user = await db.user.upsert({
    where: { email: SYSTEM_ACTOR_EMAIL },
    update: {
      status: 'ACTIVE',
      authProvider: 'LOCAL',
      displayName: 'SynAc System',
    },
    create: {
      email: SYSTEM_ACTOR_EMAIL,
      status: 'ACTIVE',
      authProvider: 'LOCAL',
      displayName: 'SynAc System',
    },
    include: { roles: { include: { role: true } } },
  });

  await ensureUserRole(db, { userId: user.id, roleId: roles.ADMIN });

  return db.user.findUniqueOrThrow({
    where: { id: user.id },
    include: { roles: { include: { role: true } } },
  });
}
