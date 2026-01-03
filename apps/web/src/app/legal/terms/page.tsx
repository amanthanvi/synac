import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

export default function TermsPage() {
  return (
    <>
      <PageHeader badge="Legal" title="Terms" subtitle="Site terms for SynAc." />
      <div style={{ maxWidth: 780, lineHeight: 1.8 }}>
        <p style={{ color: 'color-mix(in srgb, var(--fg) 72%, transparent)' }}>
          SynAc is provided as-is, without warranty. Content is curated and attributed to sources as
          recorded. For reuse, consult the relevant source license notes on each entry.
        </p>
      </div>
    </>
  );
}
