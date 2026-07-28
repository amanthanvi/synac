import { auth, currentUser } from '@clerk/nextjs/server';
import { notFound } from 'next/navigation';

import {
  bootstrapUserFromAllowlist,
  getPrismaClient,
  parseCsv,
  pickAllowlistedRole,
} from '@synac/db';

export type AdminActor = {
  userId: string;
  email: string;
  dbUserId: string;
  roleNames: Array<'ADMIN' | 'EDITOR' | 'VIEWER'>;
};

function getAllowlists(): { adminEmails: string[]; editorEmails: string[] } {
  return {
    adminEmails: parseCsv(process.env.SYNAC_ADMIN_EMAILS),
    editorEmails: parseCsv(process.env.SYNAC_EDITOR_EMAILS),
  };
}

export async function requireAdminActor(): Promise<AdminActor> {
  const isClerkConfigured = Boolean(
    process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  );
  if (!isClerkConfigured) notFound();

  const session = await auth();
  if (!session.userId) notFound();

  const clerkUser = await currentUser();
  const primaryEmail = clerkUser?.primaryEmailAddress;
  const email = primaryEmail?.emailAddress;
  if (!email) notFound();

  // The allowlist is keyed on this address, so an unverified one would let
  // anyone who can type an admin's email into Clerk inherit their access.
  if (primaryEmail?.verification?.status !== 'verified') notFound();

  const allowlists = getAllowlists();
  const allowlistedRole = pickAllowlistedRole(email, allowlists);
  if (!allowlistedRole) notFound();

  const prisma = getPrismaClient();
  const { user } = await bootstrapUserFromAllowlist(prisma, {
    email,
    displayName: clerkUser?.fullName,
    providerSubject: session.userId,
    allowlists,
  });

  if (user.status !== 'ACTIVE') notFound();

  // Authorize off the allowlist rather than the persisted role rows, so a
  // demotion takes effect on the next request even if a stale grant lingers.
  const roleNames: AdminActor['roleNames'] = [allowlistedRole];

  return {
    userId: session.userId,
    email,
    dbUserId: user.id,
    roleNames,
  };
}
