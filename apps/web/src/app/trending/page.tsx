import Link from 'next/link';

import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

export default function TrendingPage() {
  return (
    <>
      <PageHeader
        badge="Discovery"
        title="Trending"
        subtitle="Trending is computed from privacy-aware aggregated page views (7 days)."
      />
      <p style={{ color: 'color-mix(in srgb, var(--fg) 72%, transparent)', lineHeight: 1.7 }}>
        Trending is not enabled yet. For now, use{' '}
        <Link href="/recent">recent updates</Link> or browse by{' '}
        <Link href="/terms?letter=a">letter</Link>.
      </p>
    </>
  );
}

