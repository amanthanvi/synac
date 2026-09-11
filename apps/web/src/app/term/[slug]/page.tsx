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

type TermEntryPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: TermEntryPageProps): Promise<Metadata> {
  const { slug } = await params;
  // readEntryPage is wrapped in React cache(), so the page reuses this fetch.
  const page = await readEntryPage('TERM', slug.trim().toLowerCase());

  if (!page) {
    return { title: 'Not found' };
  }

  const title = page.entry.title;
  const description =
    page.entry.summaryText ??
    `SynAc entry for the cybersecurity term "${title}".`;
  const canonical = `/term/${page.entry.slug}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: 'article' },
    twitter: { title, description },
  };
}

export default async function TermEntryPage({ params }: TermEntryPageProps) {
  const { slug } = await params;
  const data = await loadPublicEntryPageData({ slug, requestedType: 'TERM' });
  return <PublicEntryPage entryType="TERM" data={data} />;
}
