import type { Metadata } from 'next';

import { BrowsePage, type BrowseSearchParams } from '@/components/BrowsePage';

// Reads searchParams (letter, page, tag, sort, q).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Acronyms',
  description:
    'Alphabetical index of published cybersecurity acronym entries, with tag filters and sorting.',
  alternates: { canonical: '/acronyms' },
};

export default async function AcronymsPage({
  searchParams,
}: {
  searchParams?: Promise<BrowseSearchParams>;
}) {
  const params = (await searchParams) ?? {};
  return <BrowsePage entryType="ACRONYM" searchParams={params} />;
}
