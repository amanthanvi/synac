import type { Metadata } from 'next';

import { BrowsePage, type BrowseSearchParams } from '@/components/BrowsePage';

export const revalidate = 300;

const title = 'Terms';
const description =
  'Alphabetical index of published cybersecurity terms, each with sourced senses and attribution.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/terms' },
  openGraph: { title, description, images: '/opengraph-image.png' },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: '/twitter-image.png',
  },
};

export default async function TermsPage({
  searchParams,
}: {
  searchParams?: Promise<BrowseSearchParams>;
}) {
  return <BrowsePage entryType="TERM" searchParams={searchParams} />;
}
