import Link from 'next/link';

import { PageHeader } from '@/components/PageHeader';
import { Panel } from '@/components/ui/Panel';

import proseStyles from '../_styles/Prose.module.css';

export const dynamic = 'force-dynamic';

export default function AdminDashboardPage() {
  return (
    <>
      <PageHeader
        badge="Admin"
        title="Dashboard"
        subtitle="Internal editorial + ingest controls. Access is allowlist-gated."
      />
      <Panel>
        <div className={proseStyles.prose}>
          <p>
            This is the v0.1.0 admin surface. Use Entries to draft/publish, Sources + Ingest to
            populate the corpus, Tags to curate navigation, Takedown for removals, and Audit for
            history/rollback.
          </p>
          <p>
            Search integrity can be inspected from <Link href="/admin/search-index">Search index</Link>.
          </p>
        </div>
      </Panel>
    </>
  );
}
