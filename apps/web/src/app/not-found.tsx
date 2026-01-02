import Link from 'next/link';

import { PageHeader } from '@/components/PageHeader';
import { SearchForm } from '@/components/SearchForm';

export default function NotFound() {
  return (
    <>
      <PageHeader
        badge="404"
        title="Page not found"
        subtitle="Try searching, or jump back into browsing."
      />

      <div style={{ maxWidth: 720 }}>
        <SearchForm placeholder="Search terms and acronyms…" />
      </div>

      <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <Link href="/">Home</Link>
        <Link href="/terms?letter=a">Terms</Link>
        <Link href="/acronyms?letter=a">Acronyms</Link>
        <Link href="/tags">Tags</Link>
      </div>
    </>
  );
}

