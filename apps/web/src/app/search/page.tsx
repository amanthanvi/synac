import Link from 'next/link';

import { PageHeader } from '@/components/PageHeader';
import { SearchForm } from '@/components/SearchForm';

export const dynamic = 'force-dynamic';

type SearchPageProps = {
  searchParams?: Promise<{ q?: string }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = (await searchParams) ?? {};
  const query = (params.q ?? '').trim();

  return (
    <>
      <PageHeader
        badge="Search"
        title="Search"
        subtitle="Type a term or acronym. Results are currently under construction."
      />

      <div style={{ maxWidth: 720 }}>
        <SearchForm defaultValue={query} placeholder="Search (e.g. SAML, SOC, zero trust)..." />
      </div>

      {query ? (
        <p style={{ marginTop: 14, color: 'color-mix(in srgb, var(--fg) 72%, transparent)' }}>
          Search results for <strong>{query}</strong> will appear here soon.
        </p>
      ) : (
        <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <Link href="/terms?letter=a">Browse terms</Link>
          <Link href="/acronyms?letter=a">Browse acronyms</Link>
          <Link href="/tags">Browse tags</Link>
        </div>
      )}
    </>
  );
}

