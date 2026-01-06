import { PageHeader } from '@/components/PageHeader';
import { Panel } from '@/components/ui/Panel';

import proseStyles from '../../_styles/Prose.module.css';

export const dynamic = 'force-dynamic';

export default function PrivacyPage() {
  return (
    <>
      <PageHeader badge="Legal" title="Privacy" subtitle="A short, plain-language privacy policy." />
      <Panel>
        <div className={proseStyles.prose}>
          <p>
            SynAc is designed to be privacy-respecting. v0.1.0 uses aggregated analytics for
            trending and does not require a public login.
          </p>
        </div>
      </Panel>
    </>
  );
}
