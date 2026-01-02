import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';

import { getPrismaClient, resolvePublishedEntryBySlug } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

type AcronymEntryPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function AcronymEntryPage({ params }: AcronymEntryPageProps) {
  const { slug } = await params;

  const prisma = getPrismaClient();
  const resolved = await resolvePublishedEntryBySlug(prisma, { entryType: 'ACRONYM', slug });

  if (!resolved) notFound();

  if (resolved.needsRedirect) {
    permanentRedirect(`/acronym/${resolved.canonicalSlug}`);
  }

  return (
    <>
      <PageHeader
        badge="Acronym"
        title={resolved.entry.displayTitle}
        subtitle={resolved.entry.summaryText ?? 'No summary yet.'}
      />

      <p style={{ color: 'color-mix(in srgb, var(--fg) 72%, transparent)', lineHeight: 1.7 }}>
        Entry rendering (expansions per sense, references, provenance) is coming next. For now,
        browse <Link href="/acronyms?letter=a">acronyms</Link> or{' '}
        <Link href="/search">search</Link>.
      </p>
    </>
  );
}

