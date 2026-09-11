import type { Metadata } from 'next';

import { PublicEntryPage } from '@/components/PublicEntryPage';
import { readEntryPage } from '@/lib/convex';
import { loadPublicEntryPageData } from '@/lib/publicEntryPage';

/**
 * The root layout calls headers() for the CSP nonce, so every render is
 * dynamic and the data cache in src/lib/convex.ts is the real caching layer.
 * This window still applies if the route is ever rendered statically.
 */
export const revalidate = 300;

type AcronymEntryPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: AcronymEntryPageProps): Promise<Metadata> {
  const { slug } = await params;
  // readEntryPage is wrapped in React cache(), so the page reuses this fetch.
  const page = await readEntryPage('ACRONYM', slug.trim().toLowerCase());

  if (!page) {
    return { title: 'Not found' };
  }

  const title = page.entry.title;
  const description =
    page.entry.summaryText ??
    `SynAc entry for the cybersecurity acronym "${title}".`;
  const canonical = `/acronym/${page.entry.slug}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: 'article' },
    twitter: { title, description },
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
  return <PublicEntryPage entryType="ACRONYM" data={data} />;
}
