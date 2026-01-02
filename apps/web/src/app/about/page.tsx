import { PageHeader } from '@/components/PageHeader';

export default function AboutPage() {
  return (
    <>
      <PageHeader
        badge="About"
        title="SynAc"
        subtitle="A public cybersecurity glossary with disambiguation, provenance, and attribution as first-class features."
      />
      <div style={{ maxWidth: 78 * 10, lineHeight: 1.8 }}>
        <p style={{ color: 'color-mix(in srgb, var(--fg) 72%, transparent)' }}>
          SynAc is built to answer one question reliably: “what does this term mean here?” —
          without losing nuance, context, or source.
        </p>
      </div>
    </>
  );
}

