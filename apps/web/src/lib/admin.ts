import { auth, currentUser } from '@clerk/nextjs/server';
import { notFound } from 'next/navigation';
import { NextResponse } from 'next/server';

import {
  bootstrapUserFromAllowlist,
  getPrismaClient,
  getRoleNames,
  parseCsv,
  pickAllowlistedRole,
} from '@synac/db';

export type RoleNameLiteral = 'ADMIN' | 'EDITOR' | 'VIEWER';

export type AdminActor = {
  userId: string;
  email: string;
  dbUserId: string;
  roleNames: RoleNameLiteral[];
};

/** The only thing the admin surface needs from the identity provider. */
export type AdminSession = {
  userId: string;
  email: string;
  displayName: string | null;
};

export type ResolveSession = () => Promise<AdminSession | null>;

/**
 * Allowlists as the app knows them. `viewerEmails` is passed through to
 * `bootstrapUserFromAllowlist`, which ignores it until the db package lands
 * support, and the extra key is harmless either way.
 */
type Allowlists = {
  adminEmails: string[];
  editorEmails: string[];
  viewerEmails: string[];
};

function getAllowlists(): Allowlists {
  return {
    adminEmails: parseCsv(process.env.SYNAC_ADMIN_EMAILS),
    editorEmails: parseCsv(process.env.SYNAC_EDITOR_EMAILS),
    viewerEmails: parseCsv(process.env.SYNAC_VIEWER_EMAILS),
  };
}

function isViewerAllowlisted(email: string, allowlists: Allowlists): boolean {
  const normalized = email.trim().toLowerCase();
  return allowlists.viewerEmails.some(
    (entry) => entry.toLowerCase() === normalized,
  );
}

/**
 * The production session source. Returns `null` unless Clerk is configured and
 * the caller is signed in with a primary email address.
 */
export const resolveClerkSession: ResolveSession = async () => {
  const configured =
    process.env.CLERK_SECRET_KEY &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!configured) return null;

  const session = await auth();
  if (!session.userId) return null;

  const clerkUser = await currentUser();
  const email = clerkUser?.primaryEmailAddress?.emailAddress;
  if (!email) return null;

  return {
    userId: session.userId,
    email,
    displayName: clerkUser?.fullName ?? null,
  };
};

/**
 * Resolve the signed-in admin actor, or `null` when the caller has no business
 * in the admin surface at all.
 *
 * Everything that fails here is deliberately indistinguishable from "this route
 * does not exist": Clerk not configured, no session, no primary email, not on
 * any allowlist, or a user row whose `status` is `DISABLED`. A disabled account
 * is unauthorized even if its email is still on an allowlist and even if its
 * role rows survive, because revoking access must not require also editing env
 * vars.
 *
 * `resolveSession` is injectable so the role logic can be exercised without an
 * identity provider.
 */
export async function getAdminActor(
  resolveSession: ResolveSession = resolveClerkSession,
): Promise<AdminActor | null> {
  const session = await resolveSession();
  if (!session) return null;

  const allowlists = getAllowlists();
  const allowlistedRole = pickAllowlistedRole(session.email, allowlists);
  if (!allowlistedRole && !isViewerAllowlisted(session.email, allowlists))
    return null;

  const prisma = getPrismaClient();
  const bootstrapped = await bootstrapUserFromAllowlist(prisma, {
    email: session.email,
    displayName: session.displayName,
    providerSubject: session.userId,
    allowlists,
  });

  // The db package returns `null` for a disabled user; treat any falsy result
  // (or a missing user) as unauthorized rather than trusting the happy path.
  if (!bootstrapped?.user) return null;

  const user = bootstrapped.user;
  if (user.status === 'DISABLED') return null;

  return {
    userId: session.userId,
    email: session.email,
    dbUserId: user.id,
    // `getRoleNames` reads `User.roles[].role.name`, a db enum whose members are
    // exactly the three literals above.
    roleNames: getRoleNames(user) as RoleNameLiteral[],
  };
}

/**
 * Page/server-action entry point. Renders the 404 page for anyone who is not a
 * valid actor, so the admin surface never confirms its own existence.
 */
export async function requireAdminActor(
  resolveSession: ResolveSession = resolveClerkSession,
): Promise<AdminActor> {
  const actor = await getAdminActor(resolveSession);
  if (!actor) notFound();
  return actor;
}

export function hasRole(
  actor: AdminActor,
  ...roles: readonly RoleNameLiteral[]
): boolean {
  return roles.some((role) => actor.roleNames.includes(role));
}

/** An empty `roles` list means "any actor will do", unlike `hasRole`. */
export function authorized(
  actor: AdminActor,
  roles: readonly RoleNameLiteral[],
): boolean {
  return roles.length === 0 || hasRole(actor, ...roles);
}

/** The single 403 shape every admin route returns. */
export function forbidden(requestId?: string): NextResponse {
  return NextResponse.json({ error: 'forbidden', requestId }, { status: 403 });
}

/**
 * Route-handler role gate. Returns the actor when it holds at least one of
 * `roles`, otherwise the 403 response to return as-is:
 *
 * ```ts
 * const actor = await requireRole(request, 'ADMIN', 'EDITOR');
 * if (actor instanceof NextResponse) return actor;
 * ```
 *
 * Authentication is checked by `requireAdminActor` (404 for non-actors);
 * authorization is checked here, at every protected operation.
 */
export async function requireRole(
  request: Request,
  ...roles: readonly RoleNameLiteral[]
): Promise<AdminActor | NextResponse> {
  const actor = await requireAdminActor();
  if (authorized(actor, roles)) return actor;

  return forbidden(request.headers.get('x-request-id')?.trim() || undefined);
}

/**
 * Server-action role gate. Actions cannot return an HTTP response, so an
 * unauthorized actor gets the same 404 treatment as an unauthenticated one.
 */
export async function requireActionRole(
  ...roles: readonly RoleNameLiteral[]
): Promise<AdminActor> {
  const actor = await requireAdminActor();
  if (authorized(actor, roles)) return actor;
  notFound();
}
