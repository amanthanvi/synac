'use client';

import { PageHeader } from '@/components/PageHeader';
import { Button, ButtonLink } from '@/components/ui/Button';

import layoutStyles from './_styles/Layout.module.css';

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <div className={layoutStyles.pageNarrow}>
      <PageHeader
        title="Something went wrong"
        subtitle="The page failed to load. Try again, or return home."
      />

      <div className={layoutStyles.stack}>
        <p className={`${layoutStyles.muted} ${layoutStyles.small}`}>
          {error.digest ? (
            <>
              Error ID: <span className={layoutStyles.mono}>{error.digest}</span>
            </>
          ) : (
            <>Error ID unavailable.</>
          )}
        </p>

        <div className={layoutStyles.row}>
          <Button type="button" variant="primary" onClick={() => reset()}>
            Try again
          </Button>
          <ButtonLink href="/" size="sm">
            Home
          </ButtonLink>
          <ButtonLink href="/search" size="sm">
            Search
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
