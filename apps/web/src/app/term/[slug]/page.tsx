import type { Metadata } from 'next';

import { PublicEntryPage } from '@/components/PublicEntryPage';
import { api, getConvexClient } from '@/lib/convex';
import { loadPublicEntryPageData } from '@/lib/publicEntryPage';

export const revalidate = 300;

type TermEntryPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: TermEntryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getConvexClient().query(api.publicEntries.getEntryPage, {
    entryType: 'TERM',
    slug: slug.trim().toLowerCase(),
  });

  if (!page) {
    return { title: 'Not found' };
  }

  return {
    title: page.entry.title,
    description:
      page.entry.summaryText ?? `SynAc entry for the cybersecurity term “${page.entry.title}”.`,
    alternates: { canonical: `/term/${page.entry.slug}` },
  };
}

export default async function TermEntryPage({ params }: TermEntryPageProps) {
  const { slug } = await params;
  const data = await loadPublicEntryPageData({ slug, requestedType: 'TERM' });
  return <PublicEntryPage entryType="TERM" data={data} />;
}
