import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

export default function AdminAuditPage() {
  return (
    <>
      <PageHeader badge="Admin" title="Audit" subtitle="Recent changes and rollback points." />
      <div style={{ opacity: 0.8, lineHeight: 1.7 }}>Coming soon.</div>
    </>
  );
}

