import type { Metadata } from 'next';

import { BrowsePage, type BrowseSearchParams } from '@/components/BrowsePage';

// Reads searchParams (letter, page, tag, sort, q).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Terms',
  description:
    'Alphabetical index of published cybersecurity term entries, with tag filters and sorting.',
  alternates: { canonical: '/terms' },
};

export default async function TermsPage({
  searchParams,
}: {
  searchParams?: Promise<BrowseSearchParams>;
}) {
  const params = (await searchParams) ?? {};
  return <BrowsePage entryType="TERM" searchParams={params} />;
}
