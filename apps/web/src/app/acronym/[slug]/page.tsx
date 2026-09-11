import type { Metadata } from 'next';

import { PublicEntryPage } from '@/components/PublicEntryPage';
import { getEntryPage } from '@/lib/publicData';
import { loadPublicEntryPageData } from '@/lib/publicEntryPage';

type AcronymEntryPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: AcronymEntryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await getEntryPage('ACRONYM', slug);

  if (result.kind !== 'ok') {
    return { title: 'Not found' };
  }

  const { entry } = result.data;

  return {
    title: entry.displayTitle,
    description:
      entry.summaryText ??
      `SynAc entry for the cybersecurity acronym “${entry.displayTitle}”.`,
    alternates: { canonical: `/acronym/${entry.primarySlug}` },
  };
}

export default async function AcronymEntryPage({
  params,
}: AcronymEntryPageProps) {
  const { slug } = await params;
  const data = await loadPublicEntryPageData({
    slug,
    requestedType: 'ACRONYM',
  });
  return <PublicEntryPage data={data} />;
}
