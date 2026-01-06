import { PageHeader } from '@/components/PageHeader';
import { Panel } from '@/components/ui/Panel';

import proseStyles from '../_styles/Prose.module.css';

export const dynamic = 'force-dynamic';

export default function AboutPage() {
  return (
    <>
      <PageHeader
        badge="About"
        title="SynAc"
        subtitle="A public cybersecurity glossary with disambiguation, provenance, and attribution as first-class features."
      />
      <Panel>
        <div className={proseStyles.prose}>
          <p>
            SynAc is built to answer one question reliably: “what does this term mean here?” —
            without losing nuance, context, or source.
          </p>
        </div>
      </Panel>
    </>
  );
}
