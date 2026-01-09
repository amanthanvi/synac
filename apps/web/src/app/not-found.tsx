import { PageHeader } from '@/components/PageHeader';
import { FocusSearchButton } from '@/components/FocusSearchButton';
import { ButtonLink } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';

import layoutStyles from './_styles/Layout.module.css';

export default function NotFound() {
  return (
    <>
      <PageHeader
        badge="404"
        title="Page not found"
        subtitle="Try searching, or jump back into browsing."
      />

      <Panel className={layoutStyles.narrow}>
        <div className={layoutStyles.stack}>
          <FocusSearchButton variant="primary">
            Focus search <span className={layoutStyles.mono}>/</span>
          </FocusSearchButton>

          <div className={layoutStyles.row}>
            <ButtonLink href="/" size="sm">
              Home
            </ButtonLink>
            <ButtonLink href="/terms?letter=a" size="sm">
              Terms
            </ButtonLink>
            <ButtonLink href="/acronyms?letter=a" size="sm">
              Acronyms
            </ButtonLink>
            <ButtonLink href="/tags" size="sm">
              Tags
            </ButtonLink>
          </div>
        </div>
      </Panel>
    </>
  );
}
