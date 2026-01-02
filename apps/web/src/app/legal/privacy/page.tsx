import { PageHeader } from '@/components/PageHeader';

export default function PrivacyPage() {
  return (
    <>
      <PageHeader badge="Legal" title="Privacy" subtitle="A short, plain-language privacy policy." />
      <div style={{ maxWidth: 780, lineHeight: 1.8 }}>
        <p style={{ color: 'color-mix(in srgb, var(--fg) 72%, transparent)' }}>
          SynAc is designed to be privacy-respecting. v0.1.0 uses aggregated analytics for trending
          and does not require a public login.
        </p>
      </div>
    </>
  );
}

