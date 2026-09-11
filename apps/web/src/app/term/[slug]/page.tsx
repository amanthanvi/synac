import type { Metadata } from 'next';

import { PublicEntryPage } from '@/components/PublicEntryPage';
import { getEntryPage } from '@/lib/publicData';
import { loadPublicEntryPageData } from '@/lib/publicEntryPage';

type TermEntryPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: TermEntryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await getEntryPage('TERM', slug);

  if (result.kind !== 'ok') {
    return { title: 'Not found' };
  }

  const { entry } = result.data;

  return {
    title: entry.displayTitle,
    description:
      entry.summaryText ??
      `SynAc entry for the cybersecurity term “${entry.displayTitle}”.`,
    alternates: { canonical: `/term/${entry.primarySlug}` },
  };
}

export default async function TermEntryPage({ params }: TermEntryPageProps) {
  const { slug } = await params;
  const data = await loadPublicEntryPageData({ slug, requestedType: 'TERM' });
  return <PublicEntryPage data={data} />;
}
