import type { Metadata } from 'next';

import { PublicEntryPage } from '@/components/PublicEntryPage';
import { getPrismaClient, resolvePublishedEntryBySlug } from '@synac/db';
import { loadPublicEntryPageData } from '@/lib/publicEntryPage';

export const dynamic = 'force-dynamic';

type AcronymEntryPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: AcronymEntryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const prisma = getPrismaClient();
  const resolved = await resolvePublishedEntryBySlug(prisma, { entryType: 'ACRONYM', slug });

  if (!resolved) {
    return { title: 'Not found' };
  }

  return {
    title: resolved.entry.displayTitle,
    description:
      resolved.entry.summaryText ??
      `SynAc entry for the cybersecurity acronym “${resolved.entry.displayTitle}”.`,
    alternates: { canonical: `/acronym/${resolved.canonicalSlug}` },
  };
}

export default async function AcronymEntryPage({ params }: AcronymEntryPageProps) {
  const { slug } = await params;
  const data = await loadPublicEntryPageData({ slug, requestedType: 'ACRONYM' });
  return <PublicEntryPage entryType="ACRONYM" data={data} />;
}
