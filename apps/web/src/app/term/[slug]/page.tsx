import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';

import { getPrismaClient, resolvePublishedEntryBySlug } from '@synac/db';

import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

type TermEntryPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function TermEntryPage({ params }: TermEntryPageProps) {
  const { slug } = await params;

  const prisma = getPrismaClient();
  const resolved = await resolvePublishedEntryBySlug(prisma, { entryType: 'TERM', slug });

  if (!resolved) notFound();

  if (resolved.needsRedirect) {
    permanentRedirect(`/term/${resolved.canonicalSlug}`);
  }

  return (
    <>
      <PageHeader
        badge="Term"
        title={resolved.entry.displayTitle}
        subtitle={resolved.entry.summaryText ?? 'No summary yet.'}
      />

      <p style={{ color: 'color-mix(in srgb, var(--fg) 72%, transparent)', lineHeight: 1.7 }}>
        Entry rendering (senses, references, provenance) is coming next. For now, browse{' '}
        <Link href="/terms?letter=a">terms</Link> or <Link href="/search">search</Link>.
      </p>
    </>
  );
}

