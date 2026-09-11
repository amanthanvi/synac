import type { Metadata } from 'next';

import { BrowsePage, type BrowseSearchParams } from '@/components/BrowsePage';

export const revalidate = 300;

const title = 'Acronyms';
const description =
  'Alphabetical index of published cybersecurity acronyms, each with expansions, sourced senses, and attribution.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/acronyms' },
  openGraph: { title, description, images: '/opengraph-image.png' },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: '/twitter-image.png',
  },
};

export default async function AcronymsPage({
  searchParams,
}: {
  searchParams?: Promise<BrowseSearchParams>;
}) {
  return <BrowsePage entryType="ACRONYM" searchParams={searchParams} />;
}
