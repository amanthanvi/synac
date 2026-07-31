import type { Metadata } from 'next';

import { PublicEntryPage } from '@/components/PublicEntryPage';
import { api, getConvexClient } from '@/lib/convex';
import { loadPublicEntryPageData } from '@/lib/publicEntryPage';

export const revalidate = 300;

type AcronymEntryPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: AcronymEntryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getConvexClient().query(api.publicEntries.getEntryPage, {
    entryType: 'ACRONYM',
    slug: slug.trim().toLowerCase(),
  });

  if (!page) {
    return { title: 'Not found' };
  }

  return {
    title: page.entry.title,
    description:
      page.entry.summaryText ??
      `SynAc entry for the cybersecurity acronym “${page.entry.title}”.`,
    alternates: { canonical: `/acronym/${page.entry.slug}` },
  };
}

export default async function AcronymEntryPage({ params }: AcronymEntryPageProps) {
  const { slug } = await params;
  const data = await loadPublicEntryPageData({ slug, requestedType: 'ACRONYM' });
  return <PublicEntryPage entryType="ACRONYM" data={data} />;
}
