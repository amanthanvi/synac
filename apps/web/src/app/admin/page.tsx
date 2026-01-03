import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

export default function AdminDashboardPage() {
  return (
    <>
      <PageHeader
        badge="Admin"
        title="Dashboard"
        subtitle="Internal editorial + ingest controls. Access is allowlist-gated."
      />
      <div style={{ opacity: 0.8, lineHeight: 1.7 }}>
        This is the v0.1.0 admin surface. Use Entries to draft/publish, Sources + Ingest
        to populate the corpus, Tags to curate navigation, Takedown for removals, and
        Audit for history/rollback.
      </div>
    </>
  );
}
