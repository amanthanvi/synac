import type { Metadata } from 'next';

import { PublicEntryPage } from '@/components/PublicEntryPage';
import { getPrismaClient, resolvePublishedEntryBySlug } from '@synac/db';
import { loadPublicEntryPageData } from '@/lib/publicEntryPage';

export const dynamic = 'force-dynamic';

type TermEntryPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: TermEntryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const prisma = getPrismaClient();
  const resolved = await resolvePublishedEntryBySlug(prisma, { entryType: 'TERM', slug });

  if (!resolved) {
    return { title: 'Not found' };
  }

  return {
    title: resolved.entry.displayTitle,
    description:
      resolved.entry.summaryText ??
      `SynAc entry for the cybersecurity term “${resolved.entry.displayTitle}”.`,
    alternates: { canonical: `/term/${resolved.canonicalSlug}` },
  };
}

export default async function TermEntryPage({ params }: TermEntryPageProps) {
  const { slug } = await params;
  const data = await loadPublicEntryPageData({ slug, requestedType: 'TERM' });
  return <PublicEntryPage entryType="TERM" data={data} />;
}
