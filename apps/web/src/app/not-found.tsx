import Link from 'next/link';

import { PageHeader } from '@/components/PageHeader';

import layoutStyles from './_styles/Layout.module.css';

export default function NotFound() {
  return (
    <div className={layoutStyles.pageNarrow}>
      <PageHeader
        title="Page not found"
        subtitle="This page doesn’t exist — the entry may have been renamed or removed."
      />
      <p className={layoutStyles.bodyText}>
        Search with <kbd className={layoutStyles.kbd}>⌘K</kbd> or{' '}
        <kbd className={layoutStyles.kbd}>/</kbd>, or start from the{' '}
        <Link className={layoutStyles.inlineLink} href="/">
          home page
        </Link>
        , <Link className={layoutStyles.inlineLink} href="/terms">
          terms
        </Link>
        , or{' '}
        <Link className={layoutStyles.inlineLink} href="/acronyms">
          acronyms
        </Link>
        .
      </p>
    </div>
  );
}
