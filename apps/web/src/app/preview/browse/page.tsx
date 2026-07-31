import Link from 'next/link';

import { BrowseControls } from '@/components/BrowseControls';
import { EntryRow, EntryRowList } from '@/components/EntryRow';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';

import browseStyles from '../../_styles/Browse.module.css';
import { browseRowsFixture } from '../fixtures';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

export default function PreviewBrowse() {
  return (
    <>
      <PageHeader title="Terms" subtitle="Alphabetical index of published term entries." />

      <nav className={browseStyles.letters} aria-label="Letters">
        {LETTERS.map((l) => (
          <Link
            key={l}
            className={`${browseStyles.letter} ${l === 'd' ? browseStyles.letterActive : ''}`}
            href="/preview/browse"
          >
            {l}
          </Link>
        ))}
      </nav>

      <BrowseControls
        basePath="/preview/browse"
        letter="d"
        sort="title"
        query=""
        activeTagSlug={null}
        tags={[
          { name: 'Access control', slug: 'access-control' },
          { name: 'Security operations', slug: 'security-operations' },
          { name: 'Fundamentals', slug: 'fundamentals' },
        ]}
      />

      <EntryRowList>
        {browseRowsFixture.map((entry) => (
          <EntryRow
            key={entry.id}
            href="/preview/entry-term"
            title={entry.displayTitle}
            entryType={entry.entryType}
            summary={entry.summaryText}
            meta="Updated Jul 06, 2026"
          />
        ))}
      </EntryRowList>

      <Pagination page={1} nextHref="/preview/browse" />
    </>
  );
}
