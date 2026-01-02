import { PageHeader } from '@/components/PageHeader';

export default function ChangelogPage() {
  return (
    <>
      <PageHeader
        badge="Updates"
        title="Changelog"
        subtitle="Versioned changes to SynAc. RSS will live here."
      />
      <div style={{ maxWidth: 780, lineHeight: 1.8 }}>
        <p style={{ color: 'color-mix(in srgb, var(--fg) 72%, transparent)' }}>
          No changelog entries yet.
        </p>
      </div>
    </>
  );
}

