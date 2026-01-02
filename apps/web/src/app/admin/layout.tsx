import { UserButton } from '@clerk/nextjs';
import { auth, currentUser } from '@clerk/nextjs/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  bootstrapUserFromAllowlist,
  getPrismaClient,
  getRoleNames,
  parseCsv,
  pickAllowlistedRole,
} from '@synac/db';

export const dynamic = 'force-dynamic';

function getAllowlists(): { adminEmails: string[]; editorEmails: string[] } {
  return {
    adminEmails: parseCsv(process.env.SYNAC_ADMIN_EMAILS),
    editorEmails: parseCsv(process.env.SYNAC_EDITOR_EMAILS),
  };
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const isClerkConfigured = Boolean(
    process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  );
  if (!isClerkConfigured) notFound();

  const session = await auth();
  if (!session.userId) notFound();

  const clerkUser = await currentUser();
  const email = clerkUser?.primaryEmailAddress?.emailAddress;
  if (!email) notFound();

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

  const roleNames = getRoleNames(user);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          paddingBottom: 12,
          borderBottom: '1px solid var(--border)',
          flexWrap: 'wrap',
        }}
      >
        <nav aria-label="Admin">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <Link href="/admin">Dashboard</Link>
            <Link href="/admin/entries">Entries</Link>
            <Link href="/admin/sources">Sources</Link>
            <Link href="/admin/ingest">Ingest</Link>
            <Link href="/admin/audit">Audit</Link>
          </div>
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.8 }}>
            {email} · {roleNames.join(', ')}
          </div>
          <UserButton afterSignOutUrl="/" />
        </div>
      </div>

      {children}
    </div>
  );
}
