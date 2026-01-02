import Link from 'next/link';

import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

export default function SourcesPage() {
  return (
    <>
      <PageHeader
        badge="Sources"
        title="Sources"
        subtitle="Registered sources with license notes and attribution requirements."
      />

      <p style={{ color: 'color-mix(in srgb, var(--fg) 72%, transparent)', lineHeight: 1.7 }}>
        Source registry UI is coming soon. For now, see the ingest/admin roadmap in{' '}
        <Link href="https://github.com/amanthanvi/synac/blob/main/SPEC.md">SPEC.md</Link>.
      </p>
    </>
  );
}

