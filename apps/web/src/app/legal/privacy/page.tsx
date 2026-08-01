import { PageHeader } from '@/components/PageHeader';

import layoutStyles from '../../_styles/Layout.module.css';
import proseStyles from '../../_styles/Prose.module.css';

export const dynamic = 'force-dynamic';

export default function PrivacyPage() {
  return (
    <div className={layoutStyles.pageNarrow}>
      <PageHeader title="Privacy" subtitle="A short, plain-language privacy policy." />
      <div className={proseStyles.prose}>
        <p>
          SynAc is designed to be privacy-respecting and does not require a public login. Basic
          operational analytics may be collected in aggregate to keep the site reliable and to
          understand broad usage patterns.
        </p>
      </div>
    </div>
  );
}
