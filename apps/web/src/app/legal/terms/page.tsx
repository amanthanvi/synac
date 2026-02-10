import { PageHeader } from '@/components/PageHeader';

import layoutStyles from '../../_styles/Layout.module.css';
import proseStyles from '../../_styles/Prose.module.css';

export const dynamic = 'force-dynamic';

export default function TermsPage() {
  return (
    <>
      <PageHeader badge="Legal" title="Terms" subtitle="Site terms for SynAc." />
      <div className={layoutStyles.narrow}>
        <div className={proseStyles.prose}>
          <p>
            SynAc is provided as-is, without warranty. Content is curated and attributed to sources
            as recorded. For reuse, consult the relevant source license notes on each entry.
          </p>
        </div>
      </div>
    </>
  );
}
