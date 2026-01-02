import type { DbClientLike } from '../client.js';
import type { Prisma, RoleName } from '../generated/prisma/client.js';

export type UserWithRoles = Prisma.UserGetPayload<{
  include: { roles: { include: { role: true } } };
}>;

export type AllowlistedRole = Exclude<RoleName, 'VIEWER'>;

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

export function pickAllowlistedRole(
  email: string,
  allowlists: { adminEmails: readonly string[]; editorEmails: readonly string[] },
): AllowlistedRole | null {
  const normalizedEmail = email.trim().toLowerCase();
  const adminEmails = new Set(allowlists.adminEmails.map((e) => e.toLowerCase()));
  if (adminEmails.has(normalizedEmail)) return 'ADMIN';

  const editorEmails = new Set(allowlists.editorEmails.map((e) => e.toLowerCase()));
  if (editorEmails.has(normalizedEmail)) return 'EDITOR';

  return null;
}

export async function ensureDefaultRoles(
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
      status: 'ACTIVE',
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

export async function ensureUserRole(
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

export async function bootstrapUserFromAllowlist(
  db: DbClientLike,
  input: {
    email: string;
    displayName?: string | null;
    providerSubject?: string | null;
    allowlists: { adminEmails: readonly string[]; editorEmails: readonly string[] };
  },
): Promise<{ user: UserWithRoles; allowlistedRole: AllowlistedRole | null }> {
  const allowlistedRole = pickAllowlistedRole(input.email, input.allowlists);

  const user = await upsertUserFromOidc(db, {
    email: input.email,
    displayName: input.displayName,
    providerSubject: input.providerSubject,
  });

  if (!allowlistedRole) {
    return { user, allowlistedRole: null };
  }

  const roles = await ensureDefaultRoles(db);
  await ensureUserRole(db, { userId: user.id, roleId: roles[allowlistedRole] });

  const refreshedUser = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    include: { roles: { include: { role: true } } },
  });

  return { user: refreshedUser, allowlistedRole };
}
